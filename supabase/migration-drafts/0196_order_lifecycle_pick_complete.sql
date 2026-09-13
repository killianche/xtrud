-- 0196: жизненный цикл задания — выбор исполнителя, завершение, отзыв по
-- завершённому заданию (владелец, 2026-09-13).
--
-- Было (доска объявлений, 2026-05-21): «Нашёл исполнителя» сразу закрывало
-- задание (cancelled + found_master), отзыв можно было оставить любому
-- специалисту без всякой связи с работой.
--
-- Стало:
--   open         — «Открыто», мастера откликаются;
--   in_progress  — «Исполнитель выбран»: клиент выбрал отклик, задание ушло
--                  из ленты, остальные откликнувшиеся узнали об этом.
--                  Можно отказаться (снова open) или отметить работу;
--   completed    — «Завершено»: клиент нажал «Работа выполнена». Только
--                  теперь клиент может оставить отзыв выбранному специалисту;
--   cancelled / expired — закрыто без исполнителя (как раньше).
--
-- Имена статусов в базе не меняются: in_progress и completed уже были в
-- перечислении с прежней модели сделки.
-- Применено на Beget 2026-09-13.

BEGIN;

-- Откликнувшийся видит задание, на которое откликался, и после того, как
-- его перестали публиковать: иначе в «Моих откликах» задание исчезало и
-- человек не узнавал, что выбрали другого. Номеров в задании «отклики в
-- приложении» нет (0168), адрес и так видят вошедшие.
DROP POLICY IF EXISTS orders_read_responders ON public.orders;
CREATE POLICY orders_read_responders ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_responses r
     WHERE r.order_id = orders.id AND r.master_id = (SELECT auth.uid())
  ));

-- Завершение больше не заводит пустой «кейс» в публичном портфолио мастера:
-- без фото и описания он только засорял бы профиль.
ALTER TABLE public.orders DISABLE TRIGGER orders_auto_create_case;

-- ── Выбрать исполнителя ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pick_order_master(p_order_id uuid, p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  -- Остальные откликнувшиеся узнают сразу, а не через 14 дней. Их отклики
  -- не гасим: если клиент откажется от исполнителя, они снова в силе.
  FOR v_other IN
    SELECT master_id FROM public.order_responses
     WHERE order_id = p_order_id AND status IN ('sent', 'viewed') AND master_id <> v_master
  LOOP
    PERFORM public.notify_user(
      v_other.master_id, 'Клиент выбрал другого исполнителя', left(v_order.title, 120),
      jsonb_build_object('type', 'order_picked_other', 'order_id', p_order_id));
  END LOOP;
END;
$$;

-- ── Отказаться от исполнителя ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unpick_order_master(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  FOR v_other IN
    SELECT master_id FROM public.order_responses
     WHERE order_id = p_order_id AND status IN ('sent', 'viewed')
  LOOP
    PERFORM public.notify_user(
      v_other.master_id, 'Задание снова ищет исполнителя', left(v_order.title, 120),
      jsonb_build_object('type', 'order_reopened', 'order_id', p_order_id));
  END LOOP;
END;
$$;

-- ── Работа выполнена ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.client_id <> v_caller THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'in_progress' OR v_order.picked_master_id IS NULL THEN
    RAISE EXCEPTION 'Сначала выберите исполнителя.'
      USING ERRCODE = 'P0001', DETAIL = 'order_not_in_progress';
  END IF;

  UPDATE public.orders
     SET status = 'completed',
         completed_at = now(),
         completion_kind = 'client_confirmed',
         last_activity_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

  -- Остальные отклики больше не нужны: об исходе люди узнали при выборе.
  UPDATE public.order_responses
     SET status = 'withdrawn', updated_at = now()
   WHERE order_id = p_order_id AND status IN ('sent', 'viewed');

  UPDATE public.master_profiles
     SET closed_deals = closed_deals + 1, updated_at = now()
   WHERE user_id = v_order.picked_master_id;

  PERFORM public.notify_user(
    v_order.picked_master_id, 'Клиент отметил работу выполненной', left(v_order.title, 120),
    jsonb_build_object('type', 'order_completed', 'order_id', p_order_id));
END;
$$;

-- ── Отзыв — только по завершённому заданию ───────────────────────────────
DROP FUNCTION IF EXISTS public.submit_master_review(uuid, integer, text);
CREATE OR REPLACE FUNCTION public.submit_master_review(
  p_target_id uuid,
  p_rating integer,
  p_text text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_author_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_review_id uuid;
  v_recent_count int;
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация' USING ERRCODE = '28000';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Оценка должна быть от 1 до 5' USING ERRCODE = '23514';
  END IF;

  -- DECISION владельца 2026-09-13: отзыв — только после завершённого
  -- задания, и только тому, кого выбрали исполнителем.
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  END IF;
  IF p_order_id IS NULL OR v_order.id IS NULL
     OR v_order.client_id <> v_author_id
     OR v_order.picked_master_id IS DISTINCT FROM p_target_id
     OR v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'Отзыв можно оставить, когда задание с этим специалистом завершено.'
      USING ERRCODE = '23514', DETAIL = 'review_requires_completed_order';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reviews WHERE order_id = p_order_id AND author_id = v_author_id) THEN
    RAISE EXCEPTION 'Вы уже оставили отзыв по этому заданию.'
      USING ERRCODE = '23505', DETAIL = 'review_exists';
  END IF;

  -- DECISION владельца 2026-09-12: один отзыв в три дня от каждого человека.
  SELECT count(*) INTO v_recent_count
    FROM public.reviews
   WHERE author_id = v_author_id
     AND direction = 'client_to_master'
     AND created_at > now() - interval '3 days';
  IF v_recent_count > 0 THEN
    RAISE EXCEPTION 'Один отзыв в три дня. Следующий можно оставить чуть позже.'
      USING ERRCODE = '23505', DETAIL = 'review_rate_limit';
  END IF;

  INSERT INTO public.reviews (order_id, author_id, target_id, l2_id, direction, rating, text)
  VALUES (p_order_id, v_author_id, p_target_id, v_order.l2_id, 'client_to_master', p_rating,
          NULLIF(trim(coalesce(p_text, '')), ''))
  RETURNING id INTO v_review_id;
  RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_order_master(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unpick_order_master(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_master_review(uuid, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_order_master(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unpick_order_master(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_master_review(uuid, integer, text, uuid) TO authenticated, service_role;

-- Уведомление выбранному: без эмодзи и с понятным следующим шагом.
CREATE OR REPLACE FUNCTION public.trg_notify_order_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND COALESCE(OLD.status::text, '') <> 'in_progress'
     AND NEW.picked_master_id IS NOT NULL THEN
    PERFORM public.notify_user(
      NEW.picked_master_id, 'Вас выбрали исполнителем',
      LEFT(COALESCE(NEW.title, ''), 120) || E'\nКлиент свяжется с вами по номеру из отклика.',
      jsonb_build_object('type', 'order_accepted', 'order_id', NEW.id));
  -- Старые сборки: закрыто как «нашёл исполнителя» с выбором из откликнувшихся.
  ELSIF NEW.status = 'cancelled' AND NEW.cancel_reason = 'found_master'
     AND NEW.picked_master_id IS NOT NULL AND OLD.picked_master_id IS DISTINCT FROM NEW.picked_master_id THEN
    PERFORM public.notify_user(
      NEW.picked_master_id, 'Клиент отметил вас исполнителем',
      LEFT(COALESCE(NEW.title, ''), 120) || E'\nЗадание закрыто. Спасибо за работу!',
      jsonb_build_object('type', 'order_picked', 'order_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

-- Задания, закрытые по старой схеме «нашёл исполнителя» с выбранным
-- специалистом, — это и есть завершённые: переводим, чтобы по ним можно было
-- оставить отзыв. Без уведомлений (триггеры уведомлений на completed молчат).
UPDATE public.orders
   SET status = 'completed',
       completed_at = coalesce(picked_at, updated_at, now()),
       completion_kind = 'client_direct',
       cancel_reason = NULL,
       cancelled_by = NULL
 WHERE status = 'cancelled' AND cancel_reason = 'found_master' AND picked_master_id IS NOT NULL;

COMMIT;
