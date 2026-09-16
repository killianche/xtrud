-- 0202: отклик — как отправленное сообщение (DECISION владельца 2026-09-16).
--
-- «Я отправил сообщение — всё, оно отправлено. Уведомлений, что не ответили,
-- быть не должно; если ответили — тогда уведомление». Специалист получает
-- уведомления только о себе как выбранном исполнителе: «Вас выбрали
-- исполнителем», «Клиент отказался от исполнителя», «Клиент отменил задание»
-- (после выбора), «Клиент отметил работу выполненной».
--
-- Убраны уведомления тем, кого не выбрали:
--   pick_order_master   — «Клиент выбрал другого исполнителя»;
--   unpick_order_master — «Задание снова ищет исполнителя»;
--   reopen_order        — «Клиент возобновил заказ»;
--   закрытие/истечение  — «Клиент нашёл исполнителя» / «Клиент закрыл задание» /
--                         «Срок задания истёк» откликнувшимся (клиенту об
--                         истечении — остаётся);
--   скрытие отклика     — «Отклик отклонён» (триггер order_responses_notify_rejected).
-- Статусы откликов и остальная логика не меняются.
-- Применено на Beget 2026-09-16.

BEGIN;

CREATE OR REPLACE FUNCTION public.pick_order_master(p_order_id uuid, p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_master uuid;
  v_resp_status public.response_status;
  v_other record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.client_id <> v_caller THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Исполнителя можно выбрать только в открытом задании.'
      USING ERRCODE = 'P0001', DETAIL = 'order_not_open';
  END IF;

  SELECT master_id, status INTO v_master, v_resp_status
    FROM public.order_responses
   WHERE id = p_response_id AND order_id = p_order_id
   FOR UPDATE;
  IF v_master IS NULL OR v_resp_status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'Этот отклик уже неактуален. Обновите экран.'
      USING ERRCODE = 'P0001', DETAIL = 'response_not_active';
  END IF;

  UPDATE public.order_responses SET status = 'accepted' WHERE id = p_response_id;

  -- trg_notify_order_accepted поздравит выбранного специалиста.
  UPDATE public.orders
     SET status = 'in_progress',
         picked_master_id = v_master,
         picked_at = now(),
         last_activity_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

END;
$function$;

CREATE OR REPLACE FUNCTION public.unpick_order_master(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_other record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.client_id <> v_caller THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Исполнитель по этому заданию не выбран.'
      USING ERRCODE = 'P0001', DETAIL = 'order_not_in_progress';
  END IF;

  UPDATE public.order_responses
     SET status = 'rejected'
   WHERE order_id = p_order_id AND master_id = v_order.picked_master_id AND status = 'accepted';

  IF v_order.picked_master_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_order.picked_master_id, 'Клиент отказался от исполнителя', left(v_order.title, 120),
      jsonb_build_object('type', 'order_unpicked', 'order_id', p_order_id));
  END IF;

  -- Задание снова в ленте; если срок почти вышел — даём неделю на поиск.
  UPDATE public.orders
     SET status = 'open',
         picked_master_id = NULL,
         picked_at = NULL,
         expires_at = greatest(coalesce(expires_at, now()), now() + interval '7 days'),
         last_activity_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_closed_at timestamptz;
  v_active int;
  v_now timestamptz := now();
  v_withdrawn_response record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Нужно войти в аккаунт.' USING ERRCODE = '28000', DETAIL = 'not_authenticated';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002', DETAIL = 'order_not_found';
  END IF;

  -- Тот же замок, что у guard_order_publication_limit: лимит активных не
  -- обойти, открывая заново и публикуя новое одновременно. Берётся до
  -- блокировки строки — как и при публикации (INSERT без блокировок строк).
  PERFORM pg_advisory_xact_lock(hashtextextended('orders_publish_limit:' || v_user_id::text, 0));

  -- Фильтр по автору до блокировки: чужое задание не заблокировать и не
  -- отличить от несуществующего.
  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id AND client_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002', DETAIL = 'order_not_found';
  END IF;

  IF v_order.status NOT IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'Это задание нельзя открыть заново.'
      USING ERRCODE = 'P0001', DETAIL = 'order_not_reopenable';
  END IF;
  -- Скрытое модерацией (admin_hide_order) возвращает только модерация.
  IF v_order.cancel_reason LIKE 'moderation:%' THEN
    RAISE EXCEPTION 'Задание скрыто модерацией. Открыть его заново можно через поддержку.'
      USING ERRCODE = 'P0001', DETAIL = 'order_hidden_by_moderation';
  END IF;

  -- Окно — от момента, когда задание закрылось или истекло.
  SELECT max(l.created_at) INTO v_closed_at
    FROM public.order_status_log l
   WHERE l.order_id = p_order_id AND l.to_status = v_order.status;
  v_closed_at := coalesce(
    v_closed_at,
    CASE WHEN v_order.status = 'expired' THEN least(v_order.expires_at, v_order.updated_at) END,
    v_order.updated_at
  );
  IF v_closed_at < v_now - interval '7 days' THEN
    RAISE EXCEPTION 'Срок, в который задание можно было вернуть, истёк.'
      USING ERRCODE = 'P0001', DETAIL = 'reopen_window_expired';
  END IF;

  SELECT count(*) INTO v_active
    FROM public.orders
   WHERE client_id = v_user_id
     AND status IN ('open', 'in_progress', 'awaiting_confirmation');
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'Не больше трёх активных заданий. Закройте одно, чтобы открыть это заново.'
      USING ERRCODE = 'P0001', DETAIL = 'active_limit';
  END IF;

  -- Исполнитель, выбранный до отмены (0196), снова обычный откликнувшийся.
  UPDATE public.order_responses SET status = 'withdrawn', updated_at = v_now
   WHERE order_id = p_order_id AND status = 'accepted';
  UPDATE public.orders SET status = 'open', cancelled_by = NULL, cancel_reason = NULL,
    picked_master_id = NULL, picked_at = NULL, last_activity_at = v_now,
    expires_at = v_now + interval '14 days', updated_at = v_now
  WHERE id = p_order_id;
  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (p_order_id, v_order.status, 'open', 'T9', v_user_id, 'user', jsonb_build_object('reopen_window_left_days', 7));
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_order_cancelled_or_expired()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_title text := LEFT(COALESCE(NEW.title, ''), 120);
  v_found boolean := NEW.status = 'cancelled' AND NEW.cancel_reason = 'found_master';
  v_title text;
  v_resp record;
BEGIN
  IF NEW.status NOT IN ('cancelled', 'expired')
     OR COALESCE(OLD.status::text, '') = NEW.status::text THEN
    RETURN NEW;
  END IF;

  -- Исполнитель, выбранный раньше (работа уже шла), узнаёт об отмене.
  -- Выбранного прямо сейчас при «Нашёл исполнителя» поздравляет
  -- trg_notify_order_accepted — «отменил» ему не пишем.
  IF NEW.status = 'cancelled' AND NOT v_found
     AND OLD.picked_master_id IS NOT NULL
     AND OLD.picked_master_id IS NOT DISTINCT FROM NEW.picked_master_id THEN
    PERFORM public.notify_user(
      NEW.picked_master_id, 'Клиент отменил задание', v_order_title,
      jsonb_build_object('type', 'order_cancelled', 'order_id', NEW.id));
  END IF;


  -- Клиенту — что задание снято и сколько есть времени вернуть его
  -- (reopen_order: 7 дней от момента, когда срок истёк).
  IF NEW.status = 'expired' THEN
    PERFORM public.notify_user(
      NEW.client_id, 'Срок задания истёк',
      v_order_title || E'\nЗадание снято с публикации. Открыть заново можно в течение 7 дней.',
      jsonb_build_object('type', 'order_expired', 'order_id', NEW.id));
  END IF;

  UPDATE public.order_responses
     SET status = 'withdrawn', updated_at = now()
   WHERE order_id = NEW.id
     AND status IN ('sent', 'viewed');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_responses_notify_rejected ON public.order_responses;

COMMIT;
