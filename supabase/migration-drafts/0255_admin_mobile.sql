-- 0255: админка на телефоне (№367/№368, 2026-10-29).
--
-- Решения владельца 2026-10-29 (docs/ADMIN_MOBILE_2026-10.md):
--   * «не задание» — отклонить с возможностью вернуть, без удаления;
--   * «Без категории» — ошибка: там висят скрытые/отклонённые задания и
--     счётчик на них;
--   * админ сам переводит человека «Частный мастер» ↔ «Компания»
--     (бригада = компания);
--   * уведомления админке на iPhone (Web Push) с настройкой по событиям.
--
-- Было (FACT, живые тела 2026-10-29):
--   * admin_list_uncategorized_orders отдаёт ВСЕ задания без категории,
--     кроме черновиков, — в т.ч. отменённые автором и скрытые модерацией
--     (5 из 5 на 2026-10-29); счётчик в меню админки = длина этого списка;
--   * admin_attention.uncategorized_open считает и «тихо скрытые»;
--   * admin_list_orders: фильтр только по настоящему статусу — отклонённые
--     модерацией (cancel_reason 'moderation:%') не отличить от отменённых
--     автором;
--   * тип аккаунта меняет только сам человек (set_account_type);
--   * Web Push нет;
--   * заявку «Большой опыт» нельзя отложить — только выдать или отклонить.
--
-- Стало:
--   * admin_list_uncategorized_orders — только открытые и не скрытые тихо;
--   * admin_attention — uncategorized_open без тихо скрытых; + companies_pending,
--     experience_pending (только админу), чтобы «Входящие» считались одним
--     запросом;
--   * admin_list_orders(p_status => 'rejected') — отклонённые модерацией
--     (последнее действие журнала по заданию — hide_order), их можно вернуть
--     admin_restore_order;
--   * admin_set_account_type(p_user_id, p_type, p_reason, p_notify) — только
--     админ (заявки компаний — ПДн, STAFF_ROLES §2), не себе; журнал
--     'account_type_set'; уведомление человеку;
--   * Web Push: xtrud_private.admin_push_subscriptions / admin_push_prefs;
--     admin_push_subscribe / admin_push_unsubscribe / admin_push_settings /
--     admin_set_push_kind / admin_push_test — сотрудник сам себе;
--     xtrud_private.admin_push_targets / admin_push_report — для xtrud-api
--     (EXECUTE только роли xtrud_api; в схеме xtrud_api у postgres нет CREATE);
--     события очередей → pg_notify (жалобы — через report_push_log, с его
--     ограничениями частоты; ревью xtrud-security 2026-10-29)('xtrud_admin_events', {"kind","ref"}) —
--     без персональных данных, только вид события и id для перехода.
--
--   * «Большой опыт» (№370): experience_badge_requests.deferred_at — админ
--     «скрывает» заявку, чтобы вернуться позже; человек по-прежнему видит
--     «На проверке». admin_list_experience_badge_requests('pending') — без
--     скрытых, ('deferred') — только скрытые; новая подача снимает скрытие;
--     admin_defer_experience_badge_request(p_user_id, p_deferred), журнал
--     'experience_badge_defer'; experience_pending — без скрытых.
--
-- Откат: 0255_admin_mobile_rollback.sql.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0255_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.admin_push_subscriptions') IS NOT NULL
     OR to_regprocedure('public.admin_set_account_type(uuid,text,text,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION '0255_already_applied';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. «Без категории»: только то, что ждёт решения.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_uncategorized_orders(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, title text, description_short text, status order_status, created_at timestamp with time zone, city_id text, city_name text, district text, village text, responses_count integer, client_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  -- Только открытые: отменённое автором и отклонённое модерацией решения не
  -- ждёт (0255). Тихо скрытые — в своём списке «Скрытые».
  RETURN QUERY
  SELECT o.id, o.title, left(o.description, 200), o.status, o.created_at,
         o.city_id, c.name, o.district, o.village, o.responses_count, o.client_id
    FROM public.orders o
    LEFT JOIN public.cities c ON c.id = o.city_id
   WHERE o.l2_id = 'uncategorized'
     AND o.status = 'open'
     AND NOT EXISTS (SELECT 1 FROM xtrud_private.order_shadow_hides h
                      WHERE h.order_id = o.id AND h.cleared_at IS NULL)
   ORDER BY o.created_at DESC, o.id DESC
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin boolean;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  v_admin := public.is_admin_session();

  RETURN jsonb_build_object(
    'reports_open',          (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    -- Экран «Управление» (0239, §5): открытые без категории (без тихо
    -- скрытых — 0255) и «красный флаг».
    'uncategorized_open',    (SELECT count(*) FROM public.orders o
                               WHERE o.l2_id = 'uncategorized' AND o.status = 'open'
                                 AND NOT EXISTS (SELECT 1 FROM xtrud_private.order_shadow_hides h
                                                  WHERE h.order_id = o.id AND h.cleared_at IS NULL)),
    'shadow_hidden',         (SELECT count(*) FROM xtrud_private.order_shadow_hides
                               WHERE cleared_at IS NULL),
    -- Разделы только для админа: управляющему NULL.
    'verifications_pending', CASE WHEN v_admin THEN
                               (SELECT count(*) FROM public.master_verifications WHERE status = 'pending') END,
    'recovery_new',          CASE WHEN v_admin THEN
                               (SELECT count(*) FROM xtrud_private.recovery_requests WHERE status = 'new') END,
    'masters_pending',       CASE WHEN v_admin THEN
                               (SELECT count(*) FROM public.master_profiles WHERE status = 'pending') END,
    'instagram_pending',     CASE WHEN v_admin THEN
                               (SELECT count(*) FROM xtrud_private.instagram_requests WHERE status = 'pending') END,
    'companies_pending',     CASE WHEN v_admin THEN
                               (SELECT count(*) FROM public.company_verifications WHERE status = 'pending') END,
    'experience_pending',    CASE WHEN v_admin THEN
                               (SELECT count(*) FROM public.experience_badge_requests
                                 WHERE status = 'pending' AND deferred_at IS NULL) END
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. «Отклонённые»: задания, снятые модерацией и ещё не возвращённые.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_orders(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, status text, created_at timestamp with time zone, city text, category text, client_id uuid, client_label text, responses_count integer, picked_master_label text, cancel_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like text;
  v_digits text;
  v_rejected boolean := p_status = 'rejected';
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF v_search IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := right(regexp_replace(v_search, '\D', '', 'g'), 10);
    IF length(v_digits) < 4 THEN
      v_digits := NULL;
    END IF;
  END IF;

  RETURN QUERY
  SELECT o.id, o.title, o.status::text, o.created_at,
         coalesce(c.name, o.district),
         l2.name_ru,
         o.client_id,
         coalesce(nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), cu.username),
         o.responses_count,
         coalesce(nullif(btrim(concat_ws(' ', pm.first_name, pm.last_name)), ''), pm.username),
         o.cancel_reason
    FROM public.orders o
    LEFT JOIN public.cities c ON c.id = o.city_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = o.l2_id
    LEFT JOIN public.users cu ON cu.id = o.client_id
    LEFT JOIN public.users pm ON pm.id = o.picked_master_id
   WHERE (CASE
            WHEN v_rejected THEN
              -- Те же условия, что у admin_restore_order: отменено, причина
              -- 'moderation:' и последнее действие журнала — hide_order.
              o.status = 'cancelled'
              AND coalesce(o.cancel_reason, '') LIKE 'moderation:%'
              AND (SELECT a.action FROM public.admin_actions a
                    WHERE a.target_type = 'order' AND a.target_id = o.id
                      AND a.action IN ('hide_order', 'restore_order')
                    ORDER BY a.performed_at DESC LIMIT 1) = 'hide_order'
            ELSE (p_status IS NULL OR p_status = '' OR o.status::text = p_status)
          END)
     AND (v_search IS NULL
          OR o.title ILIKE v_like
          OR (v_digits IS NOT NULL
              AND right(regexp_replace(coalesce(cu.contact_phone, ''), '\D', '', 'g'), 10) LIKE '%' || v_digits || '%'))
   ORDER BY CASE WHEN v_rejected THEN o.updated_at ELSE o.created_at END DESC, o.id DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Тип аккаунта меняет админ.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK ((action = ANY (ARRAY['warn'::text, 'suspend'::text, 'unsuspend'::text, 'ban'::text, 'unban'::text, 'hide'::text, 'unhide'::text, 'hide_order'::text, 'dismiss_report'::text, 'resolve_report'::text, 'issue_signed_url'::text, 'verification_approve'::text, 'verification_reject'::text, 'master_show'::text, 'master_hide'::text, 'set_password'::text, 'set_phone'::text, 'set_order_limits'::text, 'set_find_screen'::text, 'promo_banner_add'::text, 'promo_banner_update'::text, 'promo_banner_delete'::text, 'resolve_recovery_request'::text, 'restore_order'::text, 'category_show'::text, 'category_hide'::text, 'set_find_tiles'::text, 'broadcast_push'::text, 'category_open_responses'::text, 'set_require_login'::text, 'instagram_approve'::text, 'instagram_reject'::text, 'experience_badge_grant'::text, 'experience_badge_revoke'::text, 'set_composer_start'::text, 'set_composer_form'::text, 'order_set_category'::text, 'category_create'::text, 'order_shadow_hide'::text, 'order_shadow_unhide'::text, 'category_update'::text, 'category_merge'::text, 'section_rename'::text, 'catalog_reorder'::text, 'staff_role_set'::text, 'order_test_mark'::text, 'company_approve'::text, 'company_reject'::text, 'company_revoke'::text, 'experience_badge_reject'::text, 'set_home_variant'::text, 'account_type_set'::text, 'experience_badge_defer'::text])));

CREATE FUNCTION public.admin_set_account_type(p_user_id uuid, p_type text, p_reason text, p_notify boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_cur public.master_profiles%ROWTYPE;
BEGIN
  -- Только админ: у компании WhatsApp и название из заявки (STAFF_ROLES §2).
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'self_review_forbidden' USING errcode = '42501';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('solo', 'company') THEN
    RAISE EXCEPTION 'bad_account_type' USING errcode = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  SELECT * INTO v_cur FROM public.master_profiles m WHERE m.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;
  IF v_cur.account_type::text = p_type
     OR (p_type = 'company' AND v_cur.account_type = 'brigade') THEN
    RETURN xtrud_private.company_verification_state(p_user_id);
  END IF;

  IF p_type = 'solo' THEN
    -- Как set_account_type('solo'): название и значок компании уходят,
    -- заявка компании — в отозванные, ИНН стирается.
    UPDATE public.master_profiles
       SET account_type = 'solo', legal_name = NULL, company_verified_at = NULL
     WHERE user_id = p_user_id;
    UPDATE public.company_verifications
       SET status = 'withdrawn', inn = NULL, reviewed_at = NULL, reviewed_by = NULL
     WHERE user_id = p_user_id AND (status <> 'withdrawn' OR inn IS NOT NULL);
  ELSE
    -- Компания без названия: в каталоге пока имя (legal_name пуст), человек
    -- сам укажет название и отправит заявку — значок только после проверки.
    UPDATE public.master_profiles
       SET account_type = 'company', company_verified_at = NULL
     WHERE user_id = p_user_id;
  END IF;

  PERFORM public.admin_log_action('account_type_set', 'user', p_user_id, v_reason, NULL,
                                  jsonb_build_object('from', v_cur.account_type::text, 'to', p_type),
                                  NULL);

  IF coalesce(p_notify, true) THEN
    PERFORM public.notify_user(
      p_user_id,
      CASE WHEN p_type = 'company' THEN 'Профиль переведён в «Компания»'
           ELSE 'Профиль переведён в «Частный мастер»' END,
      CASE WHEN p_type = 'company'
           THEN 'Укажите название и отправьте заявку на подтверждение компании: Профиль → Проверка.'
           ELSE 'Подтвердить личность можно паспортом: Профиль → Проверка.' END,
      jsonb_build_object('type', 'system', 'kind', 'account_type'));
  END IF;

  RETURN xtrud_private.company_verification_state(p_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_account_type(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_account_type(uuid, text, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Web Push для админки.
-- ---------------------------------------------------------------------------

-- Виды событий. Только админу — очереди с ПДн (STAFF_ROLES §2).
CREATE FUNCTION xtrud_private.admin_push_kinds()
 RETURNS TABLE(kind text, admin_only boolean, default_on boolean)
 LANGUAGE sql IMMUTABLE
AS $$
  VALUES ('report',         false, true),
         ('order_review',   false, true),
         ('order_new',      false, false),
         ('passport',       true,  true),
         ('company',        true,  true),
         ('instagram',      true,  true),
         ('experience',     true,  true),
         ('recovery',       true,  true),
         ('specialist_new', true,  false)
$$;

CREATE TABLE xtrud_private.admin_push_subscriptions (
  endpoint    text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_ok_at  timestamptz,
  CONSTRAINT admin_push_endpoint_https CHECK (endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/' AND length(endpoint) <= 1000),
  CONSTRAINT admin_push_keys_len CHECK (length(p256dh) BETWEEN 40 AND 200 AND length(auth) BETWEEN 10 AND 100),
  CONSTRAINT admin_push_label_len CHECK (label IS NULL OR length(label) <= 100)
);
CREATE INDEX admin_push_subscriptions_user_idx ON xtrud_private.admin_push_subscriptions (user_id);

CREATE TABLE xtrud_private.admin_push_prefs (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind    text NOT NULL,
  enabled boolean NOT NULL,
  PRIMARY KEY (user_id, kind)
);

REVOKE ALL ON xtrud_private.admin_push_subscriptions, xtrud_private.admin_push_prefs FROM PUBLIC;
REVOKE ALL ON FUNCTION xtrud_private.admin_push_kinds() FROM PUBLIC;

-- Подписка этого устройства. Адрес — только известные push-сервисы:
-- xtrud-api шлёт POST на endpoint, свободный адрес = запрос сервера куда
-- угодно (SSRF).
CREATE FUNCTION public.admin_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_label text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_host text := substring(coalesce(p_endpoint, '') FROM '^https://([^/:?#]+)[/?#]');
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_host IS NULL OR NOT (
       v_host = 'web.push.apple.com'
       OR v_host = 'fcm.googleapis.com'
       OR v_host = 'updates.push.services.mozilla.com'
       OR v_host ~ '^[a-z0-9-]+\.notify\.windows\.com$') THEN
    RAISE EXCEPTION 'bad_endpoint' USING errcode = '22023';
  END IF;
  -- Параллельные подписки одного сотрудника — по очереди (лимит устройств).
  PERFORM pg_advisory_xact_lock(hashtext('admin_push:' || auth.uid()::text));
  IF (SELECT count(*) FROM xtrud_private.admin_push_subscriptions s
       WHERE s.user_id = auth.uid() AND s.endpoint <> p_endpoint) >= 10 THEN
    RAISE EXCEPTION 'too_many_devices' USING errcode = 'P0001';
  END IF;
  -- Чужую подписку не перехватить: обновляется только своя.
  INSERT INTO xtrud_private.admin_push_subscriptions (endpoint, user_id, p256dh, auth, label)
  VALUES (p_endpoint, auth.uid(), p_p256dh, p_auth, nullif(left(btrim(coalesce(p_label, '')), 100), ''))
  ON CONFLICT (endpoint) DO UPDATE
     SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
         label = EXCLUDED.label, created_at = now()
   WHERE admin_push_subscriptions.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'endpoint_taken' USING errcode = 'P0001';
  END IF;
END;
$function$;

CREATE FUNCTION public.admin_push_unsubscribe(p_endpoint text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;
  DELETE FROM xtrud_private.admin_push_subscriptions
   WHERE endpoint = p_endpoint AND user_id = auth.uid();
END;
$function$;

-- Настройки: виды событий, доступные роли, и включено ли каждое.
CREATE FUNCTION public.admin_push_settings(p_endpoint text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin boolean;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  v_admin := public.is_admin_session();
  RETURN jsonb_build_object(
    'kinds', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'kind', k.kind,
                       'enabled', coalesce(p.enabled, k.default_on))
                     ORDER BY k.ord), '[]'::jsonb)
                FROM (SELECT kk.*, row_number() OVER () AS ord FROM xtrud_private.admin_push_kinds() kk) k
                LEFT JOIN xtrud_private.admin_push_prefs p
                  ON p.user_id = auth.uid() AND p.kind = k.kind
               WHERE v_admin OR NOT k.admin_only),
    'devices', (SELECT count(*) FROM xtrud_private.admin_push_subscriptions s
                 WHERE s.user_id = auth.uid()),
    'this_device', p_endpoint IS NOT NULL AND EXISTS (
                     SELECT 1 FROM xtrud_private.admin_push_subscriptions s
                      WHERE s.user_id = auth.uid() AND s.endpoint = p_endpoint)
  );
END;
$function$;

CREATE FUNCTION public.admin_set_push_kind(p_kind text, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_enabled IS NULL OR NOT EXISTS (
       SELECT 1 FROM xtrud_private.admin_push_kinds() k
        WHERE k.kind = p_kind AND (NOT k.admin_only OR public.is_admin_session())) THEN
    RAISE EXCEPTION 'bad_kind' USING errcode = '22023';
  END IF;
  INSERT INTO xtrud_private.admin_push_prefs (user_id, kind, enabled)
  VALUES (auth.uid(), p_kind, p_enabled)
  ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled;
END;
$function$;

-- Пробное уведомление себе на все свои устройства.
CREATE FUNCTION public.admin_push_test()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  PERFORM pg_notify('xtrud_admin_events',
    json_build_object('kind', 'test', 'user', auth.uid())::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_push_subscribe(text, text, text, text),
                       public.admin_push_unsubscribe(text),
                       public.admin_push_settings(text),
                       public.admin_set_push_kind(text, boolean),
                       public.admin_push_test() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_push_subscribe(text, text, text, text),
                          public.admin_push_unsubscribe(text),
                          public.admin_push_settings(text),
                          public.admin_set_push_kind(text, boolean),
                          public.admin_push_test() TO authenticated, service_role;

-- Кому слать: активные сотрудники с доступом к виду события и включённой
-- настройкой. 'test' — только самому себе.
CREATE FUNCTION xtrud_private.admin_push_targets(p_kind text, p_user uuid DEFAULT NULL)
 RETURNS TABLE(endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.endpoint, s.p256dh, s.auth
    FROM xtrud_private.admin_push_subscriptions s
    JOIN public.users u ON u.id = s.user_id
   WHERE (u.is_admin OR u.staff_role = 'manager')
     AND NOT u.is_demo AND u.status = 'active'
     AND CASE
           WHEN p_kind = 'test' THEN s.user_id = p_user
           ELSE EXISTS (
             SELECT 1 FROM xtrud_private.admin_push_kinds() k
               LEFT JOIN xtrud_private.admin_push_prefs p
                 ON p.user_id = s.user_id AND p.kind = k.kind
              WHERE k.kind = p_kind
                AND (NOT k.admin_only OR u.is_admin)
                AND coalesce(p.enabled, k.default_on))
         END;
$function$;

-- Итог отправки: мёртвые подписки (404/410) — удалить, живые — отметить.
CREATE FUNCTION xtrud_private.admin_push_report(p_ok text[], p_dead text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM xtrud_private.admin_push_subscriptions WHERE endpoint = ANY(coalesce(p_dead, '{}'));
  UPDATE xtrud_private.admin_push_subscriptions SET last_ok_at = now()
   WHERE endpoint = ANY(coalesce(p_ok, '{}'));
END;
$function$;

REVOKE ALL ON FUNCTION xtrud_private.admin_push_targets(text, uuid), xtrud_private.admin_push_report(text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xtrud_private.admin_push_targets(text, uuid), xtrud_private.admin_push_report(text[], text[]) TO xtrud_api;

-- События очередей → сигнал xtrud-api. Сбой сигнала не мешает записи.
CREATE FUNCTION xtrud_private.admin_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kind text;
  v_ref text;
BEGIN
  CASE TG_TABLE_NAME
    -- Жалоба — из журнала push о жалобах: туда пишет notify_staff_new_report
    -- только после своих ограничений (не демо, тот же предмет раз в сутки,
    -- автор ≤3/ч, всего ≤20/ч). Иначе серия жалоб = серия push сотрудникам.
    WHEN 'report_push_log' THEN
      v_kind := 'report'; v_ref := NEW.report_id::text;
    WHEN 'master_verifications' THEN
      IF NEW.status::text = 'pending' AND (TG_OP = 'INSERT'
           OR OLD.status IS DISTINCT FROM NEW.status OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at) THEN
        v_kind := 'passport'; v_ref := NEW.user_id::text;
      END IF;
    WHEN 'company_verifications' THEN
      IF NEW.status = 'pending' AND (TG_OP = 'INSERT'
           OR OLD.status IS DISTINCT FROM NEW.status OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at) THEN
        v_kind := 'company'; v_ref := NEW.user_id::text;
      END IF;
    WHEN 'experience_badge_requests' THEN
      IF NEW.status = 'pending' AND (TG_OP = 'INSERT'
           OR OLD.status IS DISTINCT FROM NEW.status OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at) THEN
        v_kind := 'experience'; v_ref := NEW.user_id::text;
      END IF;
    WHEN 'instagram_requests' THEN
      IF NEW.status = 'pending' AND (TG_OP = 'INSERT'
           OR OLD.status IS DISTINCT FROM NEW.status OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at) THEN
        v_kind := 'instagram'; v_ref := NEW.user_id::text;
      END IF;
    WHEN 'recovery_requests' THEN
      IF TG_OP = 'INSERT' AND NEW.status = 'new' THEN v_kind := 'recovery'; v_ref := NEW.id::text; END IF;
    WHEN 'orders' THEN
      -- Тихо скрытое «красным флагом» и задания демо-авторов — без push.
      -- Триггер назван orders_zz_…, чтобы идти после orders_red_flag_check.
      IF NEW.status = 'open' AND NOT coalesce(NEW.is_test, false)
         AND NOT EXISTS (SELECT 1 FROM xtrud_private.order_shadow_hides h
                          WHERE h.order_id = NEW.id AND h.cleared_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.client_id AND u.is_demo) THEN
        IF NEW.l2_id = 'uncategorized'
           AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status
                OR OLD.l2_id IS DISTINCT FROM NEW.l2_id) THEN
          v_kind := 'order_review';
        ELSIF NEW.l2_id <> 'uncategorized'
           AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
          v_kind := 'order_new';
        END IF;
        v_ref := NEW.id::text;
      END IF;
    WHEN 'master_profiles' THEN
      IF TG_OP = 'INSERT' THEN v_kind := 'specialist_new'; v_ref := NEW.user_id::text; END IF;
    ELSE
      NULL;
  END CASE;
  IF v_kind IS NOT NULL THEN
    PERFORM pg_notify('xtrud_admin_events', json_build_object('kind', v_kind, 'ref', v_ref)::text);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'admin_event %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER report_push_log_admin_event AFTER INSERT ON xtrud_private.report_push_log
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();
CREATE TRIGGER master_verifications_admin_event AFTER INSERT OR UPDATE OF status, submitted_at ON public.master_verifications
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();
CREATE TRIGGER company_verifications_admin_event AFTER INSERT OR UPDATE OF status, submitted_at ON public.company_verifications
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();
CREATE TRIGGER experience_badge_requests_admin_event AFTER INSERT OR UPDATE OF status, submitted_at ON public.experience_badge_requests
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();
CREATE TRIGGER instagram_requests_admin_event AFTER INSERT OR UPDATE OF status, submitted_at ON xtrud_private.instagram_requests
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();
CREATE TRIGGER recovery_requests_admin_event AFTER INSERT ON xtrud_private.recovery_requests
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();
CREATE TRIGGER orders_zz_admin_event AFTER INSERT OR UPDATE OF status, l2_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();
CREATE TRIGGER master_profiles_admin_event AFTER INSERT ON public.master_profiles
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.admin_event();

-- ---------------------------------------------------------------------------
-- 5. «Большой опыт»: отложить заявку (№370).
-- ---------------------------------------------------------------------------
ALTER TABLE public.experience_badge_requests ADD COLUMN deferred_at timestamptz;

-- Новая подача (другой submitted_at) снова ставит заявку в очередь.
CREATE FUNCTION xtrud_private.experience_request_clear_defer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.status <> 'pending' THEN
    NEW.deferred_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER experience_badge_requests_clear_defer BEFORE UPDATE ON public.experience_badge_requests
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.experience_request_clear_defer();

CREATE OR REPLACE FUNCTION public.admin_list_experience_badge_requests(p_status text DEFAULT 'pending'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(user_id uuid, user_label text, about text, whatsapp text, status text, reason text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, granted_at timestamp with time zone, revision integer, categories text[], is_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'deferred', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  RETURN QUERY
  SELECT r.user_id,
         (SELECT nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
            FROM public.users u WHERE u.id = r.user_id),
         r.about, r.whatsapp,
         -- Скрытая заявка для админки — 'deferred' (у человека — «На проверке»).
         CASE WHEN r.status = 'pending' AND r.deferred_at IS NOT NULL THEN 'deferred' ELSE r.status END,
         r.rejection_reason,
         r.submitted_at, r.reviewed_at, m.experience_badge_at, r.revision,
         coalesce((SELECT array_agg(l2.name_ru ORDER BY l2.name_ru)
                     FROM public.master_categories mc
                     JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
                    WHERE mc.master_id = r.user_id), ARRAY[]::text[]),
         coalesce(m.verification_level >= 2, false)
    FROM public.experience_badge_requests r
    LEFT JOIN public.master_profiles m ON m.user_id = r.user_id
   WHERE (p_status IS NULL
          OR (p_status = 'pending' AND r.status = 'pending' AND r.deferred_at IS NULL)
          OR (p_status = 'deferred' AND r.status = 'pending' AND r.deferred_at IS NOT NULL)
          OR (p_status NOT IN ('pending', 'deferred') AND r.status = p_status))
     AND NOT (r.status = 'pending' AND m.experience_badge_at IS NOT NULL)
   ORDER BY (r.status = 'pending') DESC, r.submitted_at
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$function$;

CREATE FUNCTION public.admin_defer_experience_badge_request(p_user_id uuid, p_deferred boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_deferred IS NULL THEN
    RAISE EXCEPTION 'bad_value' USING errcode = '22023';
  END IF;
  UPDATE public.experience_badge_requests
     SET deferred_at = CASE WHEN p_deferred THEN now() END
   WHERE user_id = p_user_id AND status = 'pending'
     AND (deferred_at IS NULL) = p_deferred;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_pending' USING errcode = 'P0001';
  END IF;
  PERFORM public.admin_log_action('experience_badge_defer', 'user', p_user_id,
                                  CASE WHEN p_deferred THEN 'Скрыта — посмотреть позже'
                                       ELSE 'Возвращена в очередь' END,
                                  NULL, jsonb_build_object('deferred', p_deferred), NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_defer_experience_badge_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_defer_experience_badge_request(uuid, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
