-- 0175: решения владельца по разрывам продукта Р1–Р7 (2026-09-07).
--
-- Р1  «при закрытии задания спросить, кто сделал» — клиент ставит
--     picked_master_id при закрытии с причиной found_master; мастер получает
--     уведомление. Нужен грант на picked_at.
-- Р2  «отзыв не привязывать; один отзыв в неделю от пользователя» —
--     submit_master_review: лимит по автору, 7 дней, любой мастер.
-- Р3  забаненный — приложение показывает экран «заблокирован»; на сервере
--     публикация/отклики уже закрыты триггером guard_content_author_active.
-- Р4  «1 задание в день, не больше 3 активных» — триггер BEFORE INSERT.
-- Р5  «админ может скрыть задание» — admin_hide_order.
-- Р7  задание без откликов — через 24 часа клиенту приходит уведомление с
--     советами (cron раз в час), в приложении подсказка с действиями.

BEGIN;

-- Р2. Отзыв: один в неделю от автора, любому мастеру.
CREATE OR REPLACE FUNCTION public.submit_master_review(p_target_id uuid, p_rating integer, p_text text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_author_id uuid := auth.uid();
  v_review_id uuid;
  v_recent_count int;
  v_target_is_master boolean;
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация' USING ERRCODE = '28000';
  END IF;
  IF v_author_id = p_target_id THEN
    RAISE EXCEPTION 'Нельзя оставить отзыв самому себе' USING ERRCODE = '23514';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Оценка должна быть от 1 до 5' USING ERRCODE = '23514';
  END IF;
  SELECT is_master INTO v_target_is_master FROM public.users WHERE id = p_target_id;
  IF v_target_is_master IS NULL OR v_target_is_master = false THEN
    RAISE EXCEPTION 'Можно оставить отзыв только специалисту' USING ERRCODE = '23514';
  END IF;
  -- DECISION владельца 2026-09-07: один отзыв в неделю от каждого пользователя.
  SELECT count(*) INTO v_recent_count
    FROM public.reviews
   WHERE author_id = v_author_id
     AND direction = 'client_to_master'
     AND created_at > now() - interval '7 days';
  IF v_recent_count > 0 THEN
    RAISE EXCEPTION 'Один отзыв в неделю. Следующий можно оставить через несколько дней.'
      USING ERRCODE = '23505', DETAIL = 'weekly_review_limit';
  END IF;
  INSERT INTO public.reviews (order_id, author_id, target_id, l2_id, direction, rating, text)
  VALUES (NULL, v_author_id, p_target_id, NULL, 'client_to_master', p_rating,
          NULLIF(trim(coalesce(p_text, '')), ''))
  RETURNING id INTO v_review_id;
  RETURN v_review_id;
END;
$$;

-- Р4. Лимит публикации: одно задание в сутки, не больше трёх активных.
CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_today int;
  v_active int;
  v_last timestamptz;
BEGIN
  -- Без JWT (cron, миграции, service_role) — не пользовательская публикация.
  IF v_actor IS NULL OR NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  -- Сериализуем вставки одного клиента: два устройства не проскочат лимит.
  PERFORM pg_advisory_xact_lock(hashtextextended('orders_publish_limit', 0), hashtextextended(NEW.client_id::text, 0));

  SELECT count(*), max(created_at) INTO v_today, v_last
    FROM public.orders
   WHERE client_id = NEW.client_id
     AND status <> 'draft'
     AND created_at > now() - interval '24 hours';
  IF v_today >= 1 THEN
    RAISE EXCEPTION 'Одно задание в день. Следующее можно разместить %',
      to_char((v_last + interval '24 hours') AT TIME ZONE 'Europe/Moscow', 'DD.MM в HH24:MI')
      USING ERRCODE = 'P0001', DETAIL = 'daily_limit';
  END IF;

  SELECT count(*) INTO v_active
    FROM public.orders
   WHERE client_id = NEW.client_id
     AND status IN ('open', 'in_progress', 'awaiting_confirmation');
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'Не больше трёх активных заданий. Закройте одно, чтобы разместить новое.'
      USING ERRCODE = 'P0001', DETAIL = 'active_limit';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_publication_limit_guard ON public.orders;
CREATE TRIGGER orders_publication_limit_guard
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_publication_limit();

-- Р1. Клиент отмечает исполнителя при закрытии: грант на picked_at и
--     уведомление мастеру.
GRANT UPDATE (picked_at) ON public.orders TO authenticated;

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
      NEW.picked_master_id, 'Вас выбрали 🎉', LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_accepted', 'order_id', NEW.id));
  -- Р1: закрыто как «нашёл исполнителя» с выбором из откликнувшихся.
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

-- Р5. Админ скрывает задание (по жалобе или без).
CREATE OR REPLACE FUNCTION public.admin_hide_order(p_order_id uuid, p_reason text, p_report_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  IF v_order.status IN ('cancelled', 'expired', 'completed') THEN
    RAISE EXCEPTION 'order_already_closed' USING errcode = '22023';
  END IF;
  UPDATE public.orders
     SET status = 'cancelled',
         cancel_reason = LEFT('moderation: ' || v_reason, 500),
         cancelled_by = auth.uid(),
         updated_at = now()
   WHERE id = p_order_id;
  PERFORM public.admin_log_action('hide_order', 'order', p_order_id, v_reason, p_report_id,
                                  jsonb_build_object('client_id', v_order.client_id));
  IF p_report_id IS NOT NULL THEN
    UPDATE public.reports
       SET status = 'resolved', reviewed_by = auth.uid(), reviewed_at = now(),
           admin_note = 'Задание скрыто: ' || v_reason, updated_at = now()
     WHERE id = p_report_id AND status = 'pending';
  END IF;
  PERFORM public.notify_user(
    v_order.client_id, 'Задание скрыто модерацией',
    LEFT(COALESCE(v_order.title, ''), 120) || E'\nПричина: ' || v_reason || E'\nВопросы — в поддержку.',
    jsonb_build_object('type', 'order_hidden', 'order_id', p_order_id));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_hide_order(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_hide_order(uuid, text, uuid) TO authenticated;

-- Р7. Через сутки без откликов — уведомление с советами (один раз на задание).
CREATE OR REPLACE FUNCTION public.notify_orders_without_responses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order record;
  v_sent int := 0;
BEGIN
  FOR v_order IN
    SELECT o.id, o.client_id, o.title
      FROM public.orders o
     WHERE o.status = 'open'
       AND coalesce(o.responses_count, 0) = 0
       AND o.created_at < now() - interval '24 hours'
       AND o.created_at > now() - interval '14 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.user_id = o.client_id
            AND n.data->>'type' = 'order_no_responses'
            AND n.data->>'order_id' = o.id::text)
  LOOP
    PERFORM public.notify_user(
      v_order.client_id, 'Пока нет откликов',
      LEFT(COALESCE(v_order.title, ''), 120)
        || E'\nСовет: добавьте фото и бюджет, уточните описание — или выберите специалиста из каталога сами.',
      jsonb_build_object('type', 'order_no_responses', 'order_id', v_order.id));
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_orders_without_responses() FROM PUBLIC, anon, authenticated;
SELECT cron.unschedule('hourly_no_responses') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly_no_responses');
SELECT cron.schedule('hourly_no_responses', '15 * * * *', 'SELECT public.notify_orders_without_responses();');

COMMIT;
