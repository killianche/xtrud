-- 0243: аналитика админки (№299, 2026-10-08).
--
-- Решения владельца — спецификация задачи №299 (отчёт аналитика): нажатия
-- «Позвонить»/WhatsApp, просмотры заданий, активность приложения, охват
-- рассылки новых заданий, скорость первого отклика, тестовые задания.
--
-- Было (живая база 2026-10-08):
--   * событий нажатий и просмотров нет; активность — только
--     users.last_active_at (touch_last_active);
--   * mark_order_responses_viewed — SECURITY INVOKER, ставит только
--     status 'sent' → 'viewed', момента просмотра нет;
--   * тестовые задания отмечены лишь текстом причины
--     (orders.cancel_reason 'moderation: Тестовое задание…' и журнал
--     admin_actions hide_order 'Тестовое задание…'), 6 из 26 заданий.
--
-- Стало:
--   * public.analytics_events — журнал событий: RLS включён, политик нет,
--     у anon/authenticated прав нет; пишет только track_event (SECURITY
--     DEFINER) и touch_last_active; хранение 400 дней (pg_cron, от postgres,
--     как задачи 6/8/20).
--   * public.track_event(...) — EXECUTE только authenticated; любая
--     непрошедшая проверка — тихий выход без исключения (клиент не
--     должен падать из-за аналитики). Решение роли backend: для
--     source='order_contacts' master_id := автор (специалист, который
--     звонит клиенту), чтобы «связались специалисты» и нажатия специалиста
--     считались одинаково в обе стороны; для response_card master_id берётся
--     из отклика, параметр p_master_id игнорируется; для master_profile
--     p_order_id обязан быть NULL (иначе перебором заданий накручивались бы
--     нажатия одному специалисту — ревью xtrud-security 2026-10-08).
--     Нажатие (автор, вид, задание, специалист) считается раз в сутки
--     (уникальный частичный индекс), лимит — 60 событий на автора в час,
--     автор — только users.status = 'active'.
--   * touch_last_active() дополнительно пишет app_active раз в сутки
--     (уникальный частичный индекс + ON CONFLICT DO NOTHING).
--   * order_responses.viewed_at; mark_order_responses_viewed ставит
--     viewed_at = coalesce(viewed_at, now()). Функция становится SECURITY
--     DEFINER: столбцу viewed_at не выдаётся UPDATE для authenticated
--     (иначе специалист через REST мог бы сам проставить «просмотрено» своему
--     отклику — у него есть политика update_own_master). Проверка автора
--     задания в теле сохранена; ограничение RLS «блокировки» повторено явно
--     (current_user_blocked_counterparties). EXECUTE у PUBLIC/anon отозван:
--     у гостя нет заданий, он и раньше выходил на первой проверке.
--   * orders.is_test (бэкфилл по причине отмены и журналу hide_order) и
--     admin_set_order_test(...) — сотрудник (is_staff_session), журнал
--     action = 'order_test_mark'.
--   * xtrud_private.analytics_excluded_user(uuid) — админ, сотрудник, демо;
--     xtrud_private.analytics_excluded_order(uuid) — тестовое задание или
--     автор исключён. Оба — только для функций ниже (EXECUTE отозван).
--   * admin_analytics_overview / _orders / _masters / _clients / _daily —
--     сотрудник (is_staff_session), без телефонов, сутки по Europe/Moscow.
--     Сортировки: orders — created|responses|reach|clicks|first_response;
--     masters — responses|reach|views|clicks|profile_views|active|last_active;
--     clients — orders|responses|clicks|last_order|last_active.
--     Неверные значения: bad_days, bad_limit, bad_offset, bad_sort (22023).
--
-- Определения показателей (для отчёта и веб-админки):
--   период — последние p_days суток по Москве, включая сегодня;
--   опубликовано — задание создано в периоде, status <> 'draft', не тестовое,
--   автор не исключён (когорта заданий периода); отклики, охват, выбор и
--   первый отклик считаются по этой когорте; responses_total/_withdrawn и
--   дневные ряды — по дате события; «дошло» — notifications с
--   data->>'kind'='new_order'; «увидел» — событие order_view; просмотры
--   профиля — master_views.view_type='profile_open' (самопросмотр не
--   считается); active_*_avg — среднее по суткам периода начиная с первого
--   app_active (до появления событий — NULL); «специалист» в active_masters —
--   users.is_master.
--
-- Откат: 0243_admin_analytics_rollback.sql (тела функций — по md5 живых до
-- 0243, новые объекты и столбцы viewed_at/is_test удаляются).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Предусловия: живые редакции 2026-10-08.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0243_must_run_as_postgres';
  END IF;
  IF to_regclass('public.analytics_events') IS NOT NULL
     OR to_regprocedure('public.track_event(text,uuid,uuid,uuid,text,text,integer)') IS NOT NULL
     OR to_regprocedure('public.admin_set_order_test(uuid,boolean,text)') IS NOT NULL
     OR to_regprocedure('public.admin_analytics_overview(integer)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND ((table_name = 'orders' AND column_name = 'is_test')
                     OR (table_name = 'order_responses' AND column_name = 'viewed_at')))
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly_prune_analytics_events') THEN
    RAISE EXCEPTION '0243_already_applied';
  END IF;
  IF to_regprocedure('public.is_staff_session()') IS NULL
     OR to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('xtrud_private.current_user_blocked_counterparties()') IS NULL THEN
    RAISE EXCEPTION '0243_dependency_missing';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM 'a0c72c53628c9ab88fa1b4fa59d77291' THEN
    RAISE EXCEPTION '0243_admin_actions_action_check_changed';
  END IF;
  IF md5(pg_get_functiondef('public.touch_last_active()'::regprocedure))
       IS DISTINCT FROM '14dc08203844d71274cd19f543609be2'
     OR md5(pg_get_functiondef('public.mark_order_responses_viewed(uuid)'::regprocedure))
       IS DISTINCT FROM '6d2b29b987a04ecbfdc0ff1e2d772c2a' THEN
    RAISE EXCEPTION '0243_function_changed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Журнал событий.
-- ---------------------------------------------------------------------------
CREATE TABLE public.analytics_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  day         date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Moscow')::date,
  actor_id    uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  kind        text NOT NULL
              CONSTRAINT analytics_events_kind_check
              CHECK (kind IN ('call_click', 'whatsapp_click', 'order_view', 'app_active')),
  -- Без FK: задания удаляются физически, событие остаётся.
  order_id    uuid NULL,
  master_id   uuid NULL,
  response_id uuid NULL,
  source      text NULL
              CONSTRAINT analytics_events_source_check
              CHECK (source IN ('response_card', 'order_contacts', 'master_profile', 'feed', 'push', 'link')),
  platform    text NULL
              CONSTRAINT analytics_events_platform_check
              CHECK (platform IN ('ios', 'android', 'web')),
  app_build   integer NULL
              CONSTRAINT analytics_events_app_build_check
              CHECK (app_build BETWEEN 1 AND 100000)
);

COMMENT ON TABLE public.analytics_events IS
  'События аналитики админки (0243): нажатия, просмотры заданий, активность. Пишут только track_event и touch_last_active; хранение 400 дней.';

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.analytics_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.analytics_events_id_seq FROM PUBLIC, anon, authenticated;

CREATE INDEX analytics_events_at_idx ON public.analytics_events (at);
CREATE INDEX analytics_events_kind_day_idx ON public.analytics_events (kind, day);
CREATE INDEX analytics_events_order_kind_idx ON public.analytics_events (order_id, kind)
  WHERE order_id IS NOT NULL;
CREATE INDEX analytics_events_master_kind_day_idx ON public.analytics_events (master_id, kind, day)
  WHERE master_id IS NOT NULL;
CREATE INDEX analytics_events_actor_at_idx ON public.analytics_events (actor_id, at DESC);
CREATE UNIQUE INDEX analytics_events_daily_once_idx ON public.analytics_events
  (actor_id, kind, COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid), day)
  WHERE kind IN ('order_view', 'app_active');
-- Нажатие считается раз в сутки на четвёрку (автор, вид, задание, специалист).
CREATE UNIQUE INDEX analytics_events_click_daily_idx ON public.analytics_events
  (actor_id, kind,
   COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(master_id, '00000000-0000-0000-0000-000000000000'::uuid),
   day)
  WHERE kind IN ('call_click', 'whatsapp_click');

-- ---------------------------------------------------------------------------
-- 2. Новые столбцы.
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_responses ADD COLUMN viewed_at timestamptz NULL;
COMMENT ON COLUMN public.order_responses.viewed_at IS
  'Когда автор задания впервые открыл отклики (0243, mark_order_responses_viewed).';

ALTER TABLE public.orders ADD COLUMN is_test boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.orders.is_test IS
  'Тестовое задание — не входит в аналитику (0243). Меняет admin_set_order_test.';

-- Бэкфилл: тестовые задания, снятые модерацией. updated_at не трогаем
-- (отметка служебная): set_updated_at выключен только на время UPDATE,
-- таблица и так под ACCESS EXCLUSIVE после ADD COLUMN до COMMIT.
ALTER TABLE public.orders DISABLE TRIGGER orders_set_updated_at;
UPDATE public.orders o
   SET is_test = true
 WHERE o.cancel_reason LIKE 'moderation: Тестовое задание%'
    OR EXISTS (SELECT 1 FROM public.admin_actions a
                WHERE a.action = 'hide_order'
                  AND a.target_id = o.id
                  AND a.reason LIKE 'Тестовое задание%');
ALTER TABLE public.orders ENABLE TRIGGER orders_set_updated_at;

-- ---------------------------------------------------------------------------
-- 3. Журнал: новое действие order_test_mark (полный живой список + новое).
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action = ANY (ARRAY[
    'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order',
    'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve',
    'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone',
    'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update',
    'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show',
    'category_hide', 'set_find_tiles', 'broadcast_push', 'category_open_responses',
    'set_require_login', 'instagram_approve', 'instagram_reject', 'experience_badge_grant',
    'experience_badge_revoke', 'set_composer_start', 'set_composer_form',
    'order_set_category', 'category_create', 'order_shadow_hide', 'order_shadow_unhide',
    'category_update', 'category_merge', 'section_rename', 'catalog_reorder',
    'staff_role_set', 'order_test_mark'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 4. Исключения из аналитики.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.analytics_excluded_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT u.is_admin OR u.staff_role IS NOT NULL OR u.is_demo
      FROM public.users u
     WHERE u.id = p_user_id
  ), false);
$function$;

CREATE FUNCTION xtrud_private.analytics_excluded_order(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT o.is_test OR xtrud_private.analytics_excluded_user(o.client_id)
      FROM public.orders o
     WHERE o.id = p_order_id
  ), false);
$function$;

REVOKE ALL ON FUNCTION xtrud_private.analytics_excluded_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.analytics_excluded_order(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Запись событий.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.track_event(
  p_kind text,
  p_order_id uuid DEFAULT NULL,
  p_master_id uuid DEFAULT NULL,
  p_response_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_app_build integer DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_order_id uuid := p_order_id;
  v_master_id uuid := p_master_id;
  v_response_id uuid := p_response_id;
  v_source text := p_source;
  v_client uuid;
  v_contact_mode public.order_contact_mode;
  v_resp_order uuid;
  v_resp_master uuid;
BEGIN
  -- Аналитика никогда не роняет клиента: любая непрошедшая проверка — тихий выход.
  IF v_actor IS NULL THEN
    RETURN;
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('call_click', 'whatsapp_click', 'order_view', 'app_active') THEN
    RETURN;
  END IF;
  IF p_source IS NOT NULL
     AND p_source NOT IN ('response_card', 'order_contacts', 'master_profile', 'feed', 'push', 'link') THEN
    RETURN;
  END IF;
  IF p_platform IS NOT NULL AND p_platform NOT IN ('ios', 'android', 'web') THEN
    RETURN;
  END IF;
  IF p_app_build IS NOT NULL AND (p_app_build < 1 OR p_app_build > 100000) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_actor AND u.status = 'active') THEN
    RETURN;
  END IF;

  -- Не больше 60 событий на автора в час.
  IF (SELECT count(*) FROM (
        SELECT 1 FROM public.analytics_events e
         WHERE e.actor_id = v_actor AND e.at > now() - interval '1 hour'
         LIMIT 60) s) >= 60 THEN
    RETURN;
  END IF;

  IF p_kind IN ('call_click', 'whatsapp_click') THEN
    IF v_source = 'response_card' THEN
      -- Автор задания нажал контакт в отклике.
      IF p_response_id IS NULL THEN
        RETURN;
      END IF;
      SELECT r.order_id, r.master_id, o.client_id
        INTO v_resp_order, v_resp_master, v_client
        FROM public.order_responses r
        JOIN public.orders o ON o.id = r.order_id
       WHERE r.id = p_response_id;
      IF NOT FOUND
         OR v_client IS DISTINCT FROM v_actor
         OR (p_order_id IS NOT NULL AND p_order_id IS DISTINCT FROM v_resp_order) THEN
        RETURN;
      END IF;
      v_order_id := v_resp_order;
      v_master_id := v_resp_master;
    ELSIF v_source = 'order_contacts' THEN
      -- Специалист нажал открытый телефон в задании.
      IF p_order_id IS NULL THEN
        RETURN;
      END IF;
      SELECT o.client_id, o.contact_mode INTO v_client, v_contact_mode
        FROM public.orders o
       WHERE o.id = p_order_id;
      IF NOT FOUND OR v_contact_mode IS DISTINCT FROM 'phone_open' OR v_client = v_actor THEN
        RETURN;
      END IF;
      v_master_id := v_actor;
      v_response_id := NULL;
    ELSIF v_source = 'master_profile' THEN
      -- Нажатие в профиле специалиста: без задания (иначе перебор заданий
      -- накручивал бы нажатия одному специалисту).
      IF p_order_id IS NOT NULL OR p_master_id IS NULL OR p_master_id = v_actor
         OR NOT EXISTS (SELECT 1 FROM public.master_profiles mp WHERE mp.user_id = p_master_id) THEN
        RETURN;
      END IF;
      v_order_id := NULL;
      v_response_id := NULL;
    ELSE
      RETURN;
    END IF;
    -- Повтор нажатия в те же сутки отсекает analytics_events_click_daily_idx.
  ELSIF p_kind = 'order_view' THEN
    IF p_order_id IS NULL OR (v_source IS NOT NULL AND v_source NOT IN ('feed', 'push', 'link')) THEN
      RETURN;
    END IF;
    SELECT o.client_id INTO v_client FROM public.orders o WHERE o.id = p_order_id;
    IF NOT FOUND OR v_client = v_actor THEN
      RETURN;
    END IF;
    v_master_id := NULL;
    v_response_id := NULL;
  ELSE
    -- app_active: только факт, без связей.
    IF v_source IS NOT NULL THEN
      RETURN;
    END IF;
    v_order_id := NULL;
    v_master_id := NULL;
    v_response_id := NULL;
  END IF;

  INSERT INTO public.analytics_events
    (actor_id, kind, order_id, master_id, response_id, source, platform, app_build)
  VALUES
    (v_actor, p_kind, v_order_id, v_master_id, v_response_id, v_source, p_platform, p_app_build)
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.track_event(text, uuid, uuid, uuid, text, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.track_event(text, uuid, uuid, uuid, text, text, integer) TO authenticated;

-- touch_last_active: + app_active раз в сутки. Заголовок и первая строка — живые.
CREATE OR REPLACE FUNCTION public.touch_last_active()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.users set last_active_at = now() where id = auth.uid();
  -- 0243: активность для аналитики — одна строка в сутки (уникальный индекс).
  insert into public.analytics_events (actor_id, kind)
  select u.id, 'app_active' from public.users u where u.id = auth.uid()
  on conflict do nothing;
$function$;

-- mark_order_responses_viewed: + viewed_at; SECURITY DEFINER (см. шапку).
CREATE OR REPLACE FUNCTION public.mark_order_responses_viewed(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND client_id = (SELECT auth.uid())
  ) THEN
    RETURN;
  END IF;

  -- 0243: viewed_at; ограничение RLS блокировок повторено явно (DEFINER).
  UPDATE public.order_responses
    SET status = 'viewed',
        viewed_at = COALESCE(viewed_at, now())
    WHERE order_id = p_order_id AND status = 'sent'
      AND NOT (master_id = ANY (COALESCE(
            xtrud_private.current_user_blocked_counterparties(), ARRAY[]::uuid[])));
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_order_responses_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_responses_viewed(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Отметка «тестовое задание».
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_set_order_test(p_order_id uuid, p_is_test boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from boolean;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_order_id IS NULL OR p_is_test IS NULL THEN
    RAISE EXCEPTION 'bad_request' USING errcode = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT o.is_test INTO v_from FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  IF v_from = p_is_test THEN
    RETURN jsonb_build_object('ok', true, 'is_test', p_is_test, 'changed', false);
  END IF;

  UPDATE public.orders SET is_test = p_is_test WHERE id = p_order_id;

  PERFORM public.admin_log_action(
    'order_test_mark', 'order', p_order_id, v_reason, NULL,
    jsonb_build_object('from', v_from, 'to', p_is_test));

  RETURN jsonb_build_object('ok', true, 'is_test', p_is_test, 'changed', true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Отчёты.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_analytics_overview(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_to date;
  v_from date;
  v_ts_from timestamptz;
  v_ts_to timestamptz;
  v_result jsonb;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'bad_days' USING errcode = '22023';
  END IF;
  v_to := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_from := v_to - (p_days - 1);
  v_ts_from := v_from::timestamp AT TIME ZONE 'Europe/Moscow';
  v_ts_to := (v_to + 1)::timestamp AT TIME ZONE 'Europe/Moscow';

  WITH o_all AS (
    SELECT o.id, o.created_at, o.picked_master_id, o.is_test
      FROM public.orders o
     WHERE o.created_at >= v_ts_from AND o.created_at < v_ts_to
       AND o.status <> 'draft'
       AND NOT xtrud_private.analytics_excluded_user(o.client_id)
  ), o AS (
    SELECT * FROM o_all WHERE NOT is_test
  ), first_resp AS (
    SELECT o.id, min(r.created_at) AS first_at
      FROM o
      JOIN public.order_responses r ON r.order_id = o.id
     WHERE NOT xtrud_private.analytics_excluded_user(r.master_id)
     GROUP BY o.id
  ), notif AS (
    SELECT (n.data->>'order_id')::uuid AS order_id, n.user_id
      FROM public.notifications n
     WHERE n.data->>'kind' = 'new_order'
       AND n.data->>'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND NOT xtrud_private.analytics_excluded_user(n.user_id)
  ), reach AS (
    SELECT o.id, count(DISTINCT notif.user_id) AS n
      FROM o LEFT JOIN notif ON notif.order_id = o.id
     GROUP BY o.id
  ), ev AS (
    SELECT e.*
      FROM public.analytics_events e
     WHERE e.day BETWEEN v_from AND v_to
       AND NOT xtrud_private.analytics_excluded_user(e.actor_id)
       AND NOT xtrud_private.analytics_excluded_user(e.master_id)
       AND NOT xtrud_private.analytics_excluded_order(e.order_id)
  ), resp AS (
    SELECT r.status
      FROM public.order_responses r
      JOIN public.orders ro ON ro.id = r.order_id
     WHERE r.created_at >= v_ts_from AND r.created_at < v_ts_to
       AND NOT ro.is_test
       AND NOT xtrud_private.analytics_excluded_user(ro.client_id)
       AND NOT xtrud_private.analytics_excluded_user(r.master_id)
  ), active_start AS (
    SELECT CASE WHEN min(e.day) IS NOT NULL THEN greatest(v_from, min(e.day)) END AS d
      FROM public.analytics_events e
     WHERE e.kind = 'app_active'
  ), active_daily AS (
    SELECT g.d::date AS day,
           count(DISTINCT ev.actor_id) AS users,
           count(DISTINCT ev.actor_id) FILTER (WHERE u.is_master) AS masters
      FROM active_start s
      CROSS JOIN LATERAL generate_series(s.d, v_to, interval '1 day') g(d)
      LEFT JOIN ev ON ev.kind = 'app_active' AND ev.day = g.d::date
      LEFT JOIN public.users u ON u.id = ev.actor_id
     WHERE s.d IS NOT NULL AND s.d <= v_to
     GROUP BY g.d
  )
  SELECT jsonb_build_object(
    'period_from', v_from,
    'period_to', v_to,
    'tracking_since', (SELECT min(e.at) FROM public.analytics_events e
                        WHERE e.kind IN ('call_click', 'whatsapp_click')),
    'orders_published', (SELECT count(*) FROM o),
    'orders_test_excluded', (SELECT count(*) FROM o_all WHERE is_test),
    'orders_with_response', (SELECT count(*) FROM first_resp),
    'orders_with_contact', (SELECT count(DISTINCT ev.order_id) FROM ev
                             JOIN o ON o.id = ev.order_id
                            WHERE ev.kind IN ('call_click', 'whatsapp_click')),
    'orders_picked', (SELECT count(*) FROM o WHERE picked_master_id IS NOT NULL),
    'first_response_median_min', (SELECT round((percentile_cont(0.5) WITHIN GROUP (
                                     ORDER BY extract(epoch FROM fr.first_at - o.created_at) / 60))::numeric, 1)
                                    FROM first_resp fr JOIN o ON o.id = fr.id),
    'first_response_p90_min', (SELECT round((percentile_cont(0.9) WITHIN GROUP (
                                  ORDER BY extract(epoch FROM fr.first_at - o.created_at) / 60))::numeric, 1)
                                 FROM first_resp fr JOIN o ON o.id = fr.id),
    'responses_total', (SELECT count(*) FROM resp),
    'responses_withdrawn', (SELECT count(*) FROM resp WHERE status = 'withdrawn'),
    'reach_avg_masters', (SELECT round(avg(n)::numeric, 1) FROM reach),
    'orders_reached', (SELECT count(*) FROM reach WHERE n > 0),
    'order_views', (SELECT count(*) FROM ev WHERE kind = 'order_view'),
    'order_viewers', (SELECT count(DISTINCT actor_id) FROM ev WHERE kind = 'order_view'),
    'call_clicks', (SELECT count(*) FROM ev WHERE kind = 'call_click'),
    'whatsapp_clicks', (SELECT count(*) FROM ev WHERE kind = 'whatsapp_click'),
    'profile_views', (SELECT count(*) FROM public.master_views mv
                       WHERE mv.view_type = 'profile_open'
                         AND mv.created_at >= v_ts_from AND mv.created_at < v_ts_to
                         AND mv.viewer_id IS DISTINCT FROM mv.master_id
                         AND NOT xtrud_private.analytics_excluded_user(mv.master_id)
                         AND NOT xtrud_private.analytics_excluded_user(mv.viewer_id)),
    'active_masters_avg', (SELECT round(avg(masters)::numeric, 1) FROM active_daily),
    'active_users_avg', (SELECT round(avg(users)::numeric, 1) FROM active_daily),
    'signups', (SELECT count(*) FROM public.users u
                 WHERE u.created_at >= v_ts_from AND u.created_at < v_ts_to
                   AND NOT (u.is_admin OR u.staff_role IS NOT NULL OR u.is_demo))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.admin_analytics_orders(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_sort text DEFAULT 'created')
 RETURNS TABLE(
  order_id uuid, created_at timestamptz, title text, category_name text, status text,
  contact_mode text, client_id uuid, client_label text, is_test boolean,
  reached_masters integer, viewed_by_masters integer, responses integer,
  responses_active integer, minutes_to_first_response integer, call_clicks integer,
  whatsapp_clicks integer, contacted_masters integer, client_viewed_responses boolean,
  picked_master_label text, total_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_to date;
  v_from date;
  v_ts_from timestamptz;
  v_ts_to timestamptz;
  v_sort text := coalesce(p_sort, 'created');
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'bad_days' USING errcode = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'bad_limit' USING errcode = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'bad_offset' USING errcode = '22023';
  END IF;
  IF v_sort NOT IN ('created', 'responses', 'reach', 'clicks', 'first_response') THEN
    RAISE EXCEPTION 'bad_sort' USING errcode = '22023';
  END IF;
  v_to := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_from := v_to - (p_days - 1);
  v_ts_from := v_from::timestamp AT TIME ZONE 'Europe/Moscow';
  v_ts_to := (v_to + 1)::timestamp AT TIME ZONE 'Europe/Moscow';

  RETURN QUERY
  WITH o AS (
    SELECT o.*
      FROM public.orders o
     WHERE o.created_at >= v_ts_from AND o.created_at < v_ts_to
       AND o.status <> 'draft'
       AND NOT o.is_test
       AND NOT xtrud_private.analytics_excluded_user(o.client_id)
  ), res AS (
    SELECT
      o.id AS oid,
      o.created_at AS o_created_at,
      o.title AS o_title,
      c.name_ru AS o_category,
      o.status::text AS o_status,
      o.contact_mode::text AS o_contact_mode,
      o.client_id AS o_client_id,
      nullif(btrim(coalesce(cu.first_name, '') || ' ' || coalesce(cu.last_name, '')), '') AS o_client_label,
      o.is_test AS o_is_test,
      (SELECT count(DISTINCT n.user_id)::int FROM public.notifications n
        WHERE n.data->>'kind' = 'new_order' AND n.data->>'order_id' = o.id::text
          AND NOT xtrud_private.analytics_excluded_user(n.user_id)) AS o_reached,
      (SELECT count(DISTINCT e.actor_id)::int FROM public.analytics_events e
        WHERE e.order_id = o.id AND e.kind = 'order_view'
          AND NOT xtrud_private.analytics_excluded_user(e.actor_id)) AS o_viewed,
      r.total AS o_responses,
      r.active AS o_responses_active,
      floor(extract(epoch FROM r.first_at - o.created_at) / 60)::int AS o_first_min,
      k.calls AS o_calls,
      k.wa AS o_wa,
      k.masters AS o_contacted,
      coalesce(r.viewed, false) AS o_viewed_responses,
      nullif(btrim(coalesce(pu.first_name, '') || ' ' || coalesce(pu.last_name, '')), '') AS o_picked_label
    FROM o
    LEFT JOIN public.categories_l2 c ON c.id = o.l2_id
    LEFT JOIN public.users cu ON cu.id = o.client_id
    LEFT JOIN public.users pu ON pu.id = o.picked_master_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE rr.status <> 'withdrawn')::int AS active,
             min(rr.created_at) AS first_at,
             bool_or(rr.viewed_at IS NOT NULL OR rr.status IN ('viewed', 'accepted', 'rejected')) AS viewed
        FROM public.order_responses rr
       WHERE rr.order_id = o.id
         AND NOT xtrud_private.analytics_excluded_user(rr.master_id)
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE e.kind = 'call_click')::int AS calls,
             count(*) FILTER (WHERE e.kind = 'whatsapp_click')::int AS wa,
             count(DISTINCT e.master_id)::int AS masters
        FROM public.analytics_events e
       WHERE e.order_id = o.id
         AND e.kind IN ('call_click', 'whatsapp_click')
         AND NOT xtrud_private.analytics_excluded_user(e.actor_id)
         AND NOT xtrud_private.analytics_excluded_user(e.master_id)
    ) k ON true
  )
  SELECT oid, o_created_at, o_title, o_category, o_status, o_contact_mode, o_client_id,
         o_client_label, o_is_test, o_reached, o_viewed, o_responses, o_responses_active,
         o_first_min, o_calls, o_wa, o_contacted, o_viewed_responses, o_picked_label,
         (count(*) OVER ())::int
    FROM res
   ORDER BY
     CASE WHEN v_sort = 'responses' THEN o_responses END DESC NULLS LAST,
     CASE WHEN v_sort = 'reach' THEN o_reached END DESC NULLS LAST,
     CASE WHEN v_sort = 'clicks' THEN o_calls + o_wa END DESC NULLS LAST,
     CASE WHEN v_sort = 'first_response' THEN o_first_min END ASC NULLS LAST,
     o_created_at DESC, oid
   LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE FUNCTION public.admin_analytics_masters(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_sort text DEFAULT 'responses',
  p_search text DEFAULT NULL)
 RETURNS TABLE(
  master_id uuid, label text, status text, availability_status text,
  categories_count integer, reached_orders integer, order_views integer, responses integer,
  responses_withdrawn integer, responses_picked integer, profile_views integer,
  call_clicks integer, whatsapp_clicks integer, clicks_today integer, active_days integer,
  last_active_at timestamptz, rating_overall_avg numeric, total_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_to date;
  v_from date;
  v_ts_from timestamptz;
  v_ts_to timestamptz;
  v_sort text := coalesce(p_sort, 'responses');
  v_like text;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'bad_days' USING errcode = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'bad_limit' USING errcode = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'bad_offset' USING errcode = '22023';
  END IF;
  IF v_sort NOT IN ('responses', 'reach', 'views', 'clicks', 'profile_views', 'active', 'last_active') THEN
    RAISE EXCEPTION 'bad_sort' USING errcode = '22023';
  END IF;
  v_to := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_from := v_to - (p_days - 1);
  v_ts_from := v_from::timestamp AT TIME ZONE 'Europe/Moscow';
  v_ts_to := (v_to + 1)::timestamp AT TIME ZONE 'Europe/Moscow';
  IF nullif(btrim(coalesce(p_search, '')), '') IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(btrim(p_search), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT u.id AS mid,
           nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') AS m_label,
           mp.status::text AS m_status,
           mp.availability_status::text AS m_availability,
           u.last_active_at AS m_last_active,
           mp.rating_overall_avg AS m_rating
      FROM public.master_profiles mp
      JOIN public.users u ON u.id = mp.user_id
     WHERE NOT (u.is_admin OR u.staff_role IS NOT NULL OR u.is_demo)
  ), mf AS (
    SELECT * FROM m WHERE v_like IS NULL OR m_label ILIKE v_like
  ), cats AS (
    SELECT mc.master_id AS mid, count(*)::int AS n
      FROM public.master_categories mc GROUP BY mc.master_id
  ), reach AS (
    SELECT n.user_id AS mid, count(DISTINCT n.data->>'order_id')::int AS n
      FROM public.notifications n
     WHERE n.data->>'kind' = 'new_order'
       AND n.created_at >= v_ts_from AND n.created_at < v_ts_to
       AND n.data->>'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND NOT xtrud_private.analytics_excluded_order((n.data->>'order_id')::uuid)
     GROUP BY n.user_id
  ), views AS (
    SELECT e.actor_id AS mid, count(*)::int AS n
      FROM public.analytics_events e
     WHERE e.kind = 'order_view' AND e.day BETWEEN v_from AND v_to
       AND NOT xtrud_private.analytics_excluded_order(e.order_id)
     GROUP BY e.actor_id
  ), resp AS (
    SELECT r.master_id AS mid, count(*)::int AS total,
           count(*) FILTER (WHERE r.status = 'withdrawn')::int AS withdrawn
      FROM public.order_responses r
      JOIN public.orders o ON o.id = r.order_id
     WHERE r.created_at >= v_ts_from AND r.created_at < v_ts_to
       AND NOT o.is_test
       AND NOT xtrud_private.analytics_excluded_user(o.client_id)
     GROUP BY r.master_id
  ), picked AS (
    SELECT o.picked_master_id AS mid, count(*)::int AS n
      FROM public.orders o
     WHERE o.picked_master_id IS NOT NULL
       AND o.picked_at >= v_ts_from AND o.picked_at < v_ts_to
       AND NOT o.is_test
       AND NOT xtrud_private.analytics_excluded_user(o.client_id)
     GROUP BY o.picked_master_id
  ), pv AS (
    SELECT mv.master_id AS mid, count(*)::int AS n
      FROM public.master_views mv
     WHERE mv.view_type = 'profile_open'
       AND mv.created_at >= v_ts_from AND mv.created_at < v_ts_to
       AND mv.viewer_id IS DISTINCT FROM mv.master_id
       AND NOT xtrud_private.analytics_excluded_user(mv.viewer_id)
     GROUP BY mv.master_id
  ), clk AS (
    SELECT e.master_id AS mid,
           count(*) FILTER (WHERE e.kind = 'call_click')::int AS calls,
           count(*) FILTER (WHERE e.kind = 'whatsapp_click')::int AS wa,
           count(*) FILTER (WHERE e.day = v_to)::int AS today
      FROM public.analytics_events e
     WHERE e.kind IN ('call_click', 'whatsapp_click')
       AND e.master_id IS NOT NULL
       AND e.day BETWEEN v_from AND v_to
       AND NOT xtrud_private.analytics_excluded_user(e.actor_id)
       AND NOT xtrud_private.analytics_excluded_order(e.order_id)
     GROUP BY e.master_id
  ), act AS (
    SELECT e.actor_id AS mid, count(DISTINCT e.day)::int AS n
      FROM public.analytics_events e
     WHERE e.kind = 'app_active' AND e.day BETWEEN v_from AND v_to
     GROUP BY e.actor_id
  ), res AS (
    SELECT mf.mid, mf.m_label, mf.m_status, mf.m_availability,
           coalesce(cats.n, 0) AS m_cats,
           coalesce(reach.n, 0) AS m_reach,
           coalesce(views.n, 0) AS m_views,
           coalesce(resp.total, 0) AS m_resp,
           coalesce(resp.withdrawn, 0) AS m_withdrawn,
           coalesce(picked.n, 0) AS m_picked,
           coalesce(pv.n, 0) AS m_pv,
           coalesce(clk.calls, 0) AS m_calls,
           coalesce(clk.wa, 0) AS m_wa,
           coalesce(clk.today, 0) AS m_today,
           coalesce(act.n, 0) AS m_active,
           mf.m_last_active, mf.m_rating
      FROM mf
      LEFT JOIN cats ON cats.mid = mf.mid
      LEFT JOIN reach ON reach.mid = mf.mid
      LEFT JOIN views ON views.mid = mf.mid
      LEFT JOIN resp ON resp.mid = mf.mid
      LEFT JOIN picked ON picked.mid = mf.mid
      LEFT JOIN pv ON pv.mid = mf.mid
      LEFT JOIN clk ON clk.mid = mf.mid
      LEFT JOIN act ON act.mid = mf.mid
  )
  SELECT mid, m_label, m_status, m_availability, m_cats, m_reach, m_views, m_resp,
         m_withdrawn, m_picked, m_pv, m_calls, m_wa, m_today, m_active, m_last_active,
         m_rating, (count(*) OVER ())::int
    FROM res
   ORDER BY
     CASE WHEN v_sort = 'responses' THEN m_resp END DESC NULLS LAST,
     CASE WHEN v_sort = 'reach' THEN m_reach END DESC NULLS LAST,
     CASE WHEN v_sort = 'views' THEN m_views END DESC NULLS LAST,
     CASE WHEN v_sort = 'clicks' THEN m_calls + m_wa END DESC NULLS LAST,
     CASE WHEN v_sort = 'profile_views' THEN m_pv END DESC NULLS LAST,
     CASE WHEN v_sort = 'active' THEN m_active END DESC NULLS LAST,
     m_last_active DESC NULLS LAST, mid
   LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE FUNCTION public.admin_analytics_clients(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_sort text DEFAULT 'orders',
  p_search text DEFAULT NULL)
 RETURNS TABLE(
  client_id uuid, label text, orders_published integer, orders_with_response integer,
  responses_received integer, call_clicks integer, whatsapp_clicks integer,
  orders_picked integer, reviews_left integer, last_order_at timestamptz,
  last_active_at timestamptz, total_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_to date;
  v_from date;
  v_ts_from timestamptz;
  v_ts_to timestamptz;
  v_sort text := coalesce(p_sort, 'orders');
  v_like text;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'bad_days' USING errcode = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'bad_limit' USING errcode = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'bad_offset' USING errcode = '22023';
  END IF;
  IF v_sort NOT IN ('orders', 'responses', 'clicks', 'last_order', 'last_active') THEN
    RAISE EXCEPTION 'bad_sort' USING errcode = '22023';
  END IF;
  v_to := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_from := v_to - (p_days - 1);
  v_ts_from := v_from::timestamp AT TIME ZONE 'Europe/Moscow';
  v_ts_to := (v_to + 1)::timestamp AT TIME ZONE 'Europe/Moscow';
  IF nullif(btrim(coalesce(p_search, '')), '') IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(btrim(p_search), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN QUERY
  WITH all_orders AS (
    SELECT o.id, o.client_id AS cid, o.created_at, o.picked_master_id
      FROM public.orders o
     WHERE o.status <> 'draft' AND NOT o.is_test
  ), c AS (
    -- Клиент — тот, у кого есть хотя бы одно опубликованное нетестовое задание.
    SELECT u.id AS cid,
           nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') AS c_label,
           u.last_active_at AS c_last_active,
           (SELECT max(ao.created_at) FROM all_orders ao WHERE ao.cid = u.id) AS c_last_order
      FROM public.users u
     WHERE NOT (u.is_admin OR u.staff_role IS NOT NULL OR u.is_demo)
       AND EXISTS (SELECT 1 FROM all_orders ao WHERE ao.cid = u.id)
  ), cf AS (
    SELECT * FROM c
     WHERE v_like IS NULL OR c_label ILIKE v_like
  ), po AS (
    SELECT ao.* FROM all_orders ao
     WHERE ao.created_at >= v_ts_from AND ao.created_at < v_ts_to
  ), po_resp AS (
    SELECT po.id, po.cid, po.picked_master_id,
           (SELECT count(*) FROM public.order_responses r
             WHERE r.order_id = po.id
               AND NOT xtrud_private.analytics_excluded_user(r.master_id))::int AS n
      FROM po
  ), co AS (
    SELECT cid,
           count(*)::int AS published,
           count(*) FILTER (WHERE n > 0)::int AS with_resp,
           sum(n)::int AS received,
           count(*) FILTER (WHERE picked_master_id IS NOT NULL)::int AS picked
      FROM po_resp GROUP BY cid
  ), ce AS (
    SELECT x.cid,
           count(*) FILTER (WHERE e.kind = 'call_click')::int AS calls,
           count(*) FILTER (WHERE e.kind = 'whatsapp_click')::int AS wa
      FROM public.analytics_events e
      CROSS JOIN LATERAL (
        SELECT ao.client_id AS cid FROM public.orders ao WHERE ao.id = e.order_id
        UNION
        SELECT e.actor_id
      ) x
     WHERE e.kind IN ('call_click', 'whatsapp_click')
       AND e.day BETWEEN v_from AND v_to
       AND x.cid IS NOT NULL
       AND NOT xtrud_private.analytics_excluded_user(e.actor_id)
       AND NOT xtrud_private.analytics_excluded_user(e.master_id)
       AND NOT xtrud_private.analytics_excluded_order(e.order_id)
     GROUP BY x.cid
  ), rv AS (
    SELECT rw.author_id AS cid, count(*)::int AS n
      FROM public.reviews rw
     WHERE rw.direction = 'client_to_master'
       AND rw.created_at >= v_ts_from AND rw.created_at < v_ts_to
       AND NOT xtrud_private.analytics_excluded_user(rw.target_id)
     GROUP BY rw.author_id
  ), res AS (
    SELECT cf.cid, cf.c_label,
           coalesce(co.published, 0) AS c_published,
           coalesce(co.with_resp, 0) AS c_with_resp,
           coalesce(co.received, 0) AS c_received,
           coalesce(ce.calls, 0) AS c_calls,
           coalesce(ce.wa, 0) AS c_wa,
           coalesce(co.picked, 0) AS c_picked,
           coalesce(rv.n, 0) AS c_reviews,
           cf.c_last_order, cf.c_last_active
      FROM cf
      LEFT JOIN co ON co.cid = cf.cid
      LEFT JOIN ce ON ce.cid = cf.cid
      LEFT JOIN rv ON rv.cid = cf.cid
  )
  SELECT cid, c_label, c_published, c_with_resp, c_received, c_calls, c_wa, c_picked,
         c_reviews, c_last_order, c_last_active, (count(*) OVER ())::int
    FROM res
   ORDER BY
     CASE WHEN v_sort = 'orders' THEN c_published END DESC NULLS LAST,
     CASE WHEN v_sort = 'responses' THEN c_received END DESC NULLS LAST,
     CASE WHEN v_sort = 'clicks' THEN c_calls + c_wa END DESC NULLS LAST,
     CASE WHEN v_sort = 'last_order' THEN c_last_order END DESC NULLS LAST,
     CASE WHEN v_sort = 'last_active' THEN c_last_active END DESC NULLS LAST,
     c_last_order DESC NULLS LAST, cid
   LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE FUNCTION public.admin_analytics_daily(p_days integer DEFAULT 30)
 RETURNS TABLE(
  day date, signups integer, orders integer, responses integer,
  new_order_notifications integer, order_views integer, call_clicks integer,
  whatsapp_clicks integer, profile_views integer, active_masters integer,
  active_users integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_to date;
  v_from date;
  v_ts_from timestamptz;
  v_ts_to timestamptz;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'bad_days' USING errcode = '22023';
  END IF;
  v_to := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_from := v_to - (p_days - 1);
  v_ts_from := v_from::timestamp AT TIME ZONE 'Europe/Moscow';
  v_ts_to := (v_to + 1)::timestamp AT TIME ZONE 'Europe/Moscow';

  RETURN QUERY
  WITH d AS (
    SELECT g::date AS dd FROM generate_series(v_from, v_to, interval '1 day') g
  ), su AS (
    SELECT (u.created_at AT TIME ZONE 'Europe/Moscow')::date AS dd, count(*)::int AS n
      FROM public.users u
     WHERE u.created_at >= v_ts_from AND u.created_at < v_ts_to
       AND NOT (u.is_admin OR u.staff_role IS NOT NULL OR u.is_demo)
     GROUP BY 1
  ), od AS (
    SELECT (o.created_at AT TIME ZONE 'Europe/Moscow')::date AS dd, count(*)::int AS n
      FROM public.orders o
     WHERE o.created_at >= v_ts_from AND o.created_at < v_ts_to
       AND o.status <> 'draft' AND NOT o.is_test
       AND NOT xtrud_private.analytics_excluded_user(o.client_id)
     GROUP BY 1
  ), rd AS (
    SELECT (r.created_at AT TIME ZONE 'Europe/Moscow')::date AS dd, count(*)::int AS n
      FROM public.order_responses r
      JOIN public.orders o ON o.id = r.order_id
     WHERE r.created_at >= v_ts_from AND r.created_at < v_ts_to
       AND NOT o.is_test
       AND NOT xtrud_private.analytics_excluded_user(o.client_id)
       AND NOT xtrud_private.analytics_excluded_user(r.master_id)
     GROUP BY 1
  ), nd AS (
    SELECT (n.created_at AT TIME ZONE 'Europe/Moscow')::date AS dd, count(*)::int AS n
      FROM public.notifications n
     WHERE n.data->>'kind' = 'new_order'
       AND n.created_at >= v_ts_from AND n.created_at < v_ts_to
       AND n.data->>'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND NOT xtrud_private.analytics_excluded_user(n.user_id)
       AND NOT xtrud_private.analytics_excluded_order((n.data->>'order_id')::uuid)
     GROUP BY 1
  ), ed AS (
    SELECT e.day AS dd,
           count(*) FILTER (WHERE e.kind = 'order_view')::int AS views,
           count(*) FILTER (WHERE e.kind = 'call_click')::int AS calls,
           count(*) FILTER (WHERE e.kind = 'whatsapp_click')::int AS wa,
           count(DISTINCT e.actor_id) FILTER (WHERE e.kind = 'app_active' AND u.is_master)::int AS masters,
           count(DISTINCT e.actor_id) FILTER (WHERE e.kind = 'app_active')::int AS users
      FROM public.analytics_events e
      LEFT JOIN public.users u ON u.id = e.actor_id
     WHERE e.day BETWEEN v_from AND v_to
       AND NOT xtrud_private.analytics_excluded_user(e.actor_id)
       AND NOT xtrud_private.analytics_excluded_user(e.master_id)
       AND NOT xtrud_private.analytics_excluded_order(e.order_id)
     GROUP BY e.day
  ), pd AS (
    SELECT (mv.created_at AT TIME ZONE 'Europe/Moscow')::date AS dd, count(*)::int AS n
      FROM public.master_views mv
     WHERE mv.view_type = 'profile_open'
       AND mv.created_at >= v_ts_from AND mv.created_at < v_ts_to
       AND mv.viewer_id IS DISTINCT FROM mv.master_id
       AND NOT xtrud_private.analytics_excluded_user(mv.master_id)
       AND NOT xtrud_private.analytics_excluded_user(mv.viewer_id)
     GROUP BY 1
  )
  SELECT d.dd,
         coalesce(su.n, 0), coalesce(od.n, 0), coalesce(rd.n, 0), coalesce(nd.n, 0),
         coalesce(ed.views, 0), coalesce(ed.calls, 0), coalesce(ed.wa, 0),
         coalesce(pd.n, 0), coalesce(ed.masters, 0), coalesce(ed.users, 0)
    FROM d
    LEFT JOIN su ON su.dd = d.dd
    LEFT JOIN od ON od.dd = d.dd
    LEFT JOIN rd ON rd.dd = d.dd
    LEFT JOIN nd ON nd.dd = d.dd
    LEFT JOIN ed ON ed.dd = d.dd
    LEFT JOIN pd ON pd.dd = d.dd
   ORDER BY d.dd;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_order_test(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_analytics_overview(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_analytics_orders(integer, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_analytics_masters(integer, integer, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_analytics_clients(integer, integer, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_analytics_daily(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_order_test(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_overview(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_orders(integer, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_masters(integer, integer, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_clients(integer, integer, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_daily(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Хранение: 400 дней (pg_cron от postgres, как задачи 6/8/20).
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'nightly_prune_analytics_events',
  '50 3 * * *',
  $$DELETE FROM public.analytics_events WHERE at < now() - interval '400 days'$$);

-- ---------------------------------------------------------------------------
-- Постпроверки.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.analytics_events'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.analytics_events'::regclass)
     OR has_table_privilege('anon', 'public.analytics_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.analytics_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_sequence_privilege('authenticated', 'public.analytics_events_id_seq', 'USAGE,SELECT,UPDATE')
     OR has_sequence_privilege('anon', 'public.analytics_events_id_seq', 'USAGE,SELECT,UPDATE') THEN
    RAISE EXCEPTION '0243_analytics_events_access_wrong';
  END IF;
  -- Чтение viewed_at участниками — через живой табличный SELECT (RLS
  -- read_participants); запись — только mark_order_responses_viewed.
  IF has_column_privilege('authenticated', 'public.order_responses', 'viewed_at', 'UPDATE')
     OR has_column_privilege('anon', 'public.order_responses', 'viewed_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.order_responses', 'viewed_at', 'INSERT')
     OR has_column_privilege('anon', 'public.order_responses', 'viewed_at', 'INSERT')
     OR has_column_privilege('authenticated', 'public.orders', 'is_test', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.orders', 'is_test', 'INSERT') THEN
    RAISE EXCEPTION '0243_viewed_at_exposed';
  END IF;
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proacl::text AS acl, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('admin_set_order_test', 'admin_analytics_overview', 'admin_analytics_orders',
                         'admin_analytics_masters', 'admin_analytics_clients', 'admin_analytics_daily',
                         'track_event', 'mark_order_responses_viewed', 'touch_last_active')
  LOOP
    IF NOT r.prosecdef
       OR r.acl IS DISTINCT FROM (CASE
            WHEN r.sig::text LIKE 'track_event(%' THEN '{postgres=X/postgres,authenticated=X/postgres}'
            ELSE '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
          END) THEN
      RAISE EXCEPTION '0243_acl_wrong: % %', r.sig, r.acl;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('admin_set_order_test', 'admin_analytics_overview', 'admin_analytics_orders',
                           'admin_analytics_masters', 'admin_analytics_clients', 'admin_analytics_daily')
         AND p.prosrc LIKE '%IF NOT public.is_staff_session() THEN%') <> 6 THEN
    RAISE EXCEPTION '0243_staff_check_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'xtrud_private'
                AND p.proname IN ('analytics_excluded_user', 'analytics_excluded_order')
                AND (p.proacl IS NULL OR p.proacl::text <> '{postgres=X/postgres}')) THEN
    RAISE EXCEPTION '0243_private_acl_wrong';
  END IF;
  IF (SELECT tgenabled FROM pg_trigger
       WHERE tgrelid = 'public.orders'::regclass AND tgname = 'orders_set_updated_at') IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION '0243_updated_at_trigger_not_enabled';
  END IF;
  IF (SELECT count(*) FROM cron.job
       WHERE jobname = 'nightly_prune_analytics_events' AND username = 'postgres' AND active) <> 1 THEN
    RAISE EXCEPTION '0243_cron_missing';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
