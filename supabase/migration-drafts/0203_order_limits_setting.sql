-- 0203: лимиты публикации заданий — настройка в админке (владелец, 2026-09-16:
-- «дай возможность выкладывать задания сколько хотят; настройку ограничения
-- добавь в админку»).
--
-- Было: «одно задание в сутки» (0175/0201) и «не больше трёх активных» зашиты
-- в guard_order_publication_limit и reopen_order.
-- Стало: public.app_settings, ключ order_limits = {"daily": N, "active": M};
-- 0 — без ограничения. Сейчас оба 0. Журнал публикаций (0201) пишется
-- по-прежнему — лимит можно включить в любой момент без потери истории.
-- Менять — только админ через admin_set_order_limits (запись в журнал
-- действий). Читать может любой: приложению нужно знать лимит заранее.
-- Применено на Beget 2026-09-16.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_settings FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_settings (key, value)
VALUES ('order_limits', '{"daily": 0, "active": 0}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.order_limits()
RETURNS TABLE(daily integer, active integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce((value->>'daily')::int, 0), coalesce((value->>'active')::int, 0)
    FROM public.app_settings WHERE key = 'order_limits'
  UNION ALL
  SELECT 0, 0 WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'order_limits')
  LIMIT 1;
$$;

-- Для приложения и админки: {"daily": N, "active": M}.
CREATE OR REPLACE FUNCTION public.get_order_limits()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object('daily', daily, 'active', active) FROM public.order_limits();
$$;

ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn','suspend','unsuspend','ban','unban','hide','unhide','hide_order','dismiss_report',
  'resolve_report','issue_signed_url','verification_approve','verification_reject',
  'master_show','master_hide','set_password','set_phone','set_order_limits']));
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_target_type_check CHECK (target_type = ANY (ARRAY[
  'user','order','order_response','review','report','storage_object','settings']));

CREATE OR REPLACE FUNCTION public.admin_set_order_limits(p_daily integer, p_active integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_daily IS NULL OR p_active IS NULL OR p_daily < 0 OR p_active < 0 OR p_daily > 100 OR p_active > 100 THEN
    RAISE EXCEPTION 'Лимит — целое число от 0 до 100 (0 — без ограничения).'
      USING ERRCODE = '22023', DETAIL = 'bad_limits';
  END IF;

  SELECT value INTO v_old FROM public.app_settings WHERE key = 'order_limits';
  v_new := jsonb_build_object('daily', p_daily, 'active', p_active);
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('order_limits', v_new, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();

  PERFORM public.admin_log_action(
    'set_order_limits', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    coalesce(nullif(btrim(p_reason), ''), 'Лимиты публикации заданий'),
    NULL, jsonb_build_object('old', v_old, 'new', v_new));
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.order_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_order_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_limits() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_order_limits(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_order_limits(integer, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_today int;
  v_active int;
  v_last timestamptz;
  v_daily int;
  v_active_limit int;
BEGIN
  IF v_actor IS NULL OR NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  -- S1: чужой client_id — не наша публикация. Вставку отклонит RLS
  -- (orders_insert_own), а здесь не считаем чужое и не берём чужой замок.
  IF NEW.client_id IS DISTINCT FROM v_actor THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('orders_publish_limit:' || NEW.client_id::text, 0));
  -- Лимиты — из настроек админки (0203); 0 — без ограничения.
  SELECT daily, active INTO v_daily, v_active_limit FROM public.order_limits();

  -- 0201: отменённые и удалённые тоже считаются (N4). Orders — задания до
  -- журнала и вставки без JWT; журнал — то, что уже удалено из orders.
  SELECT count(*), min(published_at) INTO v_today, v_last
    FROM (
      SELECT o.id, o.created_at AS published_at
        FROM public.orders o
       WHERE o.client_id = NEW.client_id
         AND o.status <> 'draft'
         AND o.created_at > now() - interval '24 hours'
      UNION
      SELECT l.order_id, l.published_at
        FROM xtrud_private.order_publication_log l
       WHERE l.client_id = NEW.client_id
         AND l.published_at > now() - interval '24 hours'
    ) s;
  IF v_daily > 0 AND v_today >= v_daily THEN
    RAISE EXCEPTION '%',
      CASE WHEN v_daily = 1 THEN 'Одно задание в сутки. Следующее можно разместить '
           ELSE 'Не больше ' || v_daily || ' заданий в сутки. Следующее можно разместить ' END
      || to_char((v_last + interval '24 hours') AT TIME ZONE 'Europe/Moscow', 'DD.MM в HH24:MI')
      USING ERRCODE = 'P0001', DETAIL = 'daily_limit';
  END IF;

  SELECT count(*) INTO v_active
    FROM public.orders
   WHERE client_id = NEW.client_id
     AND status IN ('open', 'in_progress', 'awaiting_confirmation');
  IF v_active_limit > 0 AND v_active >= v_active_limit THEN
    RAISE EXCEPTION 'Не больше % активных заданий. Закройте одно, чтобы разместить новое.', v_active_limit
      USING ERRCODE = 'P0001', DETAIL = 'active_limit';
  END IF;

  -- Чистка журнала — не здесь, а в nightly_prune_publication_log (S3).
  INSERT INTO xtrud_private.order_publication_log (order_id, client_id, published_at)
  VALUES (NEW.id, NEW.client_id, now())
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
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
  v_active_limit int;
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
  SELECT active INTO v_active_limit FROM public.order_limits();
  IF v_active_limit > 0 AND v_active >= v_active_limit THEN
    RAISE EXCEPTION 'Не больше % активных заданий. Закройте одно, чтобы открыть это заново.', v_active_limit
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

COMMIT;
