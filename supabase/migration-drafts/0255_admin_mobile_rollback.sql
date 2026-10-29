-- Откат 0255 (админка на телефоне). Применять от postgres:
-- psql -v ON_ERROR_STOP=1 -q < 0255_admin_mobile_rollback.sql
--
-- Сначала — живые тела четырёх функций до 0255 (сняты pg_get_functiondef
-- 2026-10-29 перед применением): после них ничто не ссылается на
-- deferred_at, и столбец можно удалять (ревью xtrud-security, находка 1).
BEGIN;

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
    -- Экран «Управление» (0239, §5): открытые без категории и «красный флаг».
    'uncategorized_open',    (SELECT count(*) FROM public.orders
                               WHERE l2_id = 'uncategorized' AND status = 'open'),
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
                               (SELECT count(*) FROM xtrud_private.instagram_requests WHERE status = 'pending') END
  );
END;
$function$
;
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
  RETURN QUERY
  SELECT o.id, o.title, left(o.description, 200), o.status, o.created_at,
         o.city_id, c.name, o.district, o.village, o.responses_count, o.client_id
    FROM public.orders o
    LEFT JOIN public.cities c ON c.id = o.city_id
   WHERE o.l2_id = 'uncategorized'
     AND o.status <> 'draft'
   ORDER BY (o.status = 'open') DESC, o.created_at DESC, o.id DESC
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$function$
;
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
   WHERE (p_status IS NULL OR p_status = '' OR o.status::text = p_status)
     AND (v_search IS NULL
          OR o.title ILIKE v_like
          OR (v_digits IS NOT NULL
              AND right(regexp_replace(coalesce(cu.contact_phone, ''), '\D', '', 'g'), 10) LIKE '%' || v_digits || '%'))
   ORDER BY o.created_at DESC, o.id DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$
;
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
  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  RETURN QUERY
  SELECT r.user_id,
         (SELECT nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
            FROM public.users u WHERE u.id = r.user_id),
         r.about, r.whatsapp, r.status, r.rejection_reason,
         r.submitted_at, r.reviewed_at, m.experience_badge_at, r.revision,
         coalesce((SELECT array_agg(l2.name_ru ORDER BY l2.name_ru)
                     FROM public.master_categories mc
                     JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
                    WHERE mc.master_id = r.user_id), ARRAY[]::text[]),
         coalesce(m.verification_level >= 2, false)
    FROM public.experience_badge_requests r
    LEFT JOIN public.master_profiles m ON m.user_id = r.user_id
   WHERE (p_status IS NULL OR r.status = p_status)
     AND NOT (r.status = 'pending' AND m.experience_badge_at IS NOT NULL)
   ORDER BY (r.status = 'pending') DESC, r.submitted_at
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$function$
;

DROP TRIGGER IF EXISTS report_push_log_admin_event ON xtrud_private.report_push_log;
DROP TRIGGER IF EXISTS master_verifications_admin_event ON public.master_verifications;
DROP TRIGGER IF EXISTS company_verifications_admin_event ON public.company_verifications;
DROP TRIGGER IF EXISTS experience_badge_requests_admin_event ON public.experience_badge_requests;
DROP TRIGGER IF EXISTS instagram_requests_admin_event ON xtrud_private.instagram_requests;
DROP TRIGGER IF EXISTS recovery_requests_admin_event ON xtrud_private.recovery_requests;
DROP TRIGGER IF EXISTS orders_zz_admin_event ON public.orders;
DROP TRIGGER IF EXISTS master_profiles_admin_event ON public.master_profiles;
DROP FUNCTION IF EXISTS xtrud_private.admin_event();
DROP FUNCTION IF EXISTS xtrud_private.admin_push_report(text[], text[]);
DROP FUNCTION IF EXISTS xtrud_private.admin_push_targets(text, uuid);
DROP FUNCTION IF EXISTS public.admin_push_test();
DROP FUNCTION IF EXISTS public.admin_set_push_kind(text, boolean);
DROP FUNCTION IF EXISTS public.admin_push_settings(text);
DROP FUNCTION IF EXISTS public.admin_push_unsubscribe(text);
DROP FUNCTION IF EXISTS public.admin_push_subscribe(text, text, text, text);
DROP TABLE IF EXISTS xtrud_private.admin_push_prefs;
DROP TABLE IF EXISTS xtrud_private.admin_push_subscriptions;
DROP FUNCTION IF EXISTS xtrud_private.admin_push_kinds();
DROP FUNCTION IF EXISTS public.admin_set_account_type(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_defer_experience_badge_request(uuid, boolean);
DROP TRIGGER IF EXISTS experience_badge_requests_clear_defer ON public.experience_badge_requests;
DROP FUNCTION IF EXISTS xtrud_private.experience_request_clear_defer();
ALTER TABLE public.experience_badge_requests DROP COLUMN IF EXISTS deferred_at;
-- 'account_type_set' / 'experience_badge_defer' в CHECK журнала остаются:
-- строки журнала не удаляются.
NOTIFY pgrst, 'reload schema';
COMMIT;
