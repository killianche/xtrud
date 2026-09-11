-- 0185 — важные события, о которых люди не узнавали.
--
-- ЗАЧЕМ (FACT, 2026-09-11). По просьбе владельца сверил все источники
-- notify_user с тем, что умеет приложение. Нашлось:
--  1. Закрытие «Нашёл исполнителя» с выбором из откликнувшихся: выбранный
--     получал «Клиент отметил вас исполнителем» и тут же ещё два «Клиент
--     отменил заказ» (своя ветка и общий цикл по откликам). Остальным
--     откликнувшимся приходило «Клиент отменил заказ», хотя клиент нашёл
--     исполнителя.
--  2. Срок задания истёк — узнавали только откликнувшиеся. Сам клиент не
--     знал, что задание снято и что вернуть его можно лишь 7 дней.
--  3. Клиент скрыл отклик (статус rejected) — специалист не узнавал и ждал.
--  4. Админ скрыл специалиста из каталога или вернул — специалист не узнавал.
--
-- Не добавлено сознательно: ответ автору жалобы, блокировка аккаунта
-- (заблокированный и так видит экран блокировки), «клиент посмотрел отклик»
-- — это шум, а не событие.

BEGIN;

-- 1 и 2. Задание закрыто или истекло.
CREATE OR REPLACE FUNCTION public.trg_notify_order_cancelled_or_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  v_title := CASE
    WHEN v_found THEN 'Клиент нашёл исполнителя'
    WHEN NEW.status = 'cancelled' THEN 'Клиент закрыл задание'
    ELSE 'Срок задания истёк'
  END;
  FOR v_resp IN
    SELECT master_id FROM public.order_responses
     WHERE order_id = NEW.id
       AND status IN ('sent', 'viewed')
       AND master_id IS DISTINCT FROM NEW.picked_master_id
  LOOP
    PERFORM public.notify_user(
      v_resp.master_id, v_title, v_order_title,
      jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id));
  END LOOP;

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
$$;

-- 3. Клиент скрыл отклик. Триггер, а не вызов в reject_response: статус
--    может смениться и другим путём — специалист должен узнать в любом случае.
CREATE OR REPLACE FUNCTION public.trg_notify_response_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order_title text;
BEGIN
  SELECT LEFT(COALESCE(title, ''), 120) INTO v_order_title
    FROM public.orders WHERE id = NEW.order_id;
  BEGIN
    PERFORM public.notify_user(
      NEW.master_id, 'Отклик отклонён', COALESCE(v_order_title, ''),
      jsonb_build_object('type', 'response_rejected', 'order_id', NEW.order_id,
                         'response_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_notify_response_rejected: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_response_rejected() FROM PUBLIC;

DROP TRIGGER IF EXISTS order_responses_notify_rejected ON public.order_responses;
CREATE TRIGGER order_responses_notify_rejected
  AFTER UPDATE OF status ON public.order_responses
  FOR EACH ROW
  WHEN (OLD.status IN ('sent', 'viewed') AND NEW.status = 'rejected')
  EXECUTE FUNCTION public.trg_notify_response_rejected();

-- 4. Админ скрыл специалиста из каталога или вернул. Пишем только при
--    настоящей смене: повторное нажатие той же кнопки — не событие.
CREATE OR REPLACE FUNCTION public.admin_set_master_visibility(
  p_user_id uuid,
  p_visible boolean,
  p_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prev_status public.master_status;
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  SELECT status INTO v_prev_status FROM public.master_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;
  IF p_visible THEN
    UPDATE public.master_profiles
       SET status = 'active', is_hidden_from_search = false, updated_at = now()
     WHERE user_id = p_user_id;
    PERFORM public.try_publish_master(p_user_id);
  ELSE
    UPDATE public.master_profiles
       SET status = 'suspended', is_hidden_from_search = true, updated_at = now()
     WHERE user_id = p_user_id;
  END IF;
  INSERT INTO public.admin_actions (admin_id, target_type, target_id, action, reason, details)
  VALUES (auth.uid(), 'user', p_user_id,
          CASE WHEN p_visible THEN 'master_show' ELSE 'master_hide' END,
          COALESCE(v_reason, CASE WHEN p_visible THEN 'Показан в каталоге' ELSE 'Скрыт из каталога' END),
          '{}'::jsonb);

  IF p_visible AND v_prev_status = 'suspended' THEN
    PERFORM public.notify_user(
      p_user_id, 'Профиль снова в каталоге',
      'Клиенты снова видят вас во вкладке «Специалисты».',
      jsonb_build_object('type', 'master_shown'));
  ELSIF NOT p_visible AND v_prev_status IS DISTINCT FROM 'suspended' THEN
    PERFORM public.notify_user(
      p_user_id, 'Профиль скрыт из каталога',
      COALESCE('Причина: ' || v_reason || '. ', '')
        || 'Если это ошибка, напишите в поддержку.',
      jsonb_build_object('type', 'master_hidden'));
  END IF;
END;
$$;

COMMIT;
