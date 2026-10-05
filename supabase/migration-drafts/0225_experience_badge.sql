-- 0225: значок «Большой опыт» и проверенные выше в поиске (№228).
--
-- Владелец, 2026-10-05 (ответ на №196): «если у человека есть опыт, который
-- мы субъективно решим, что он заслуживает значка, — дадим ему значок.
-- Бесплатно. Постоянно, пока не снимем вручную. В админке — добавление к
-- мастеру. Без чисел — годы и объекты человек сам пишет у себя. Поднимать
-- проверенных выше — сортировка грамотная».
--
-- Было: признаков опыта, выданных площадкой, нет; поиск специалистов —
--   по ranking_score.
-- Стало:
--   - master_profiles.experience_badge_at — значок выдан (когда); кто выдал —
--     в журнале admin_actions (ревью L1: не в профиле, который читают все
--     вошедшие); писать могут только функции владельца базы
--     (у authenticated права UPDATE по 11 колонкам, этих среди них нет);
--   - public.admin_set_experience_badge(user, on, reason) — выдать/снять,
--     журнал, уведомление специалисту при выдаче;
--   - search_masters возвращает has_experience_badge и ставит выше по
--     ступеньке: паспорт + значок, одно из двух, остальные; внутри — как было;
--   - admin_list_masters возвращает is_verified и has_experience_badge.
--
-- Откат: 0225_experience_badge_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0225_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'master_profiles'
                AND column_name = 'experience_badge_at') THEN
    RAISE EXCEPTION '0225_already_applied';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conname = 'admin_actions_action_check' AND conrelid = 'public.admin_actions'::regclass)
     IS DISTINCT FROM 'cf4c7df60870ed312d0b7a5c8bb52bae' THEN
    RAISE EXCEPTION '0225_action_check_changed';
  END IF;
  IF has_column_privilege('authenticated', 'public.master_profiles', 'verification_level', 'UPDATE') THEN
    RAISE EXCEPTION '0225_unexpected_master_profiles_grants';
  END IF;
END;
$$;

-- 1. Значок.
ALTER TABLE public.master_profiles ADD COLUMN experience_badge_at timestamptz;
COMMENT ON COLUMN public.master_profiles.experience_badge_at IS
  'Значок «Большой опыт» выдан админом (0225); NULL — нет. Пишет только admin_set_experience_badge.';
GRANT SELECT (experience_badge_at) ON public.master_profiles TO anon;

-- 2. Журнал: два новых действия (полный живой список + новые).
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show', 'category_hide', 'set_find_tiles', 'broadcast_push', 'category_open_responses', 'set_require_login', 'instagram_approve', 'instagram_reject',
  'experience_badge_grant', 'experience_badge_revoke'
]::text[]));

-- 3. Выдать / снять.
CREATE FUNCTION public.admin_set_experience_badge(p_user_id uuid, p_on boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_had boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  SELECT experience_badge_at IS NOT NULL INTO v_had
    FROM public.master_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;
  IF v_had = p_on THEN
    RETURN; -- уже так
  END IF;
  UPDATE public.master_profiles
     SET experience_badge_at = CASE WHEN p_on THEN now() END,
         updated_at = now()
   WHERE user_id = p_user_id;
  PERFORM public.admin_log_action(
    CASE WHEN p_on THEN 'experience_badge_grant' ELSE 'experience_badge_revoke' END,
    'user', p_user_id, v_reason, NULL, '{}'::jsonb);
  IF p_on THEN
    PERFORM public.notify_user(p_user_id, 'Значок «Большой опыт»',
      'Мы отметили ваш опыт — значок виден клиентам в вашем профиле.',
      jsonb_build_object('type', 'experience_badge'));
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_experience_badge(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_experience_badge(uuid, boolean, text) TO authenticated, service_role;

-- 4. Поиск специалистов: признак значка и ступенька проверенных.
DROP FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text);
CREATE FUNCTION public.search_masters(p_query text DEFAULT NULL::text, p_l2_id text DEFAULT NULL::text, p_city_id text DEFAULT NULL::text, p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_l1_id text DEFAULT NULL::text, p_sort text DEFAULT 'rating'::text, p_district text DEFAULT NULL::text, p_village text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar_url text, city_id text, city_name text, district text, bio text, experience_years integer, rating_avg numeric, rating_count integer, closed_deals integer, categories text[], is_verified boolean, has_experience_badge boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH q AS (
    SELECT nullif(btrim(coalesce(p_query, '')), '') AS text_query
  ),
  candidates AS (
    SELECT
      mp.user_id, u.first_name, u.last_name, u.avatar_url, u.city_id,
      c.name AS city_name, u.district, mp.bio, mp.experience_years,
      mp.rating_overall_avg AS rating_avg, mp.rating_overall_count AS rating_count,
      mp.closed_deals, mp.ranking_score, mp.availability_status,
      (mp.verification_level >= 2) AS is_verified,
      (mp.experience_badge_at IS NOT NULL) AS has_experience_badge,
      coalesce(array_agg(DISTINCT l2.name_ru) FILTER (WHERE l2.name_ru IS NOT NULL), ARRAY[]::text[]) AS categories
    FROM public.master_profiles mp
    JOIN public.users u ON u.id = mp.user_id
    LEFT JOIN public.cities c ON c.id = u.city_id
    LEFT JOIN public.master_categories mc ON mc.master_id = mp.user_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
    WHERE mp.status = 'active'
      AND coalesce(mp.is_hidden_from_search, false) = false
      AND coalesce(mp.hidden_by_owner, false) = false
      AND u.status = 'active'
      AND u.onboarding_completed_at IS NOT NULL
      AND (NOT p_hide_demo OR coalesce(u.is_demo, false) = false)
      -- Место (0192, 0212): место не выбрано; либо город самого специалиста
      -- равен выбранному; либо зон нет — «вся Ингушетия»; либо зона
      -- специалиста совпадает с выбранным местом (район включает свои города
      -- и сёла, город и село одного района не совпадают).
      AND (
        (p_city_id IS NULL AND p_district IS NULL AND p_village IS NULL)
        OR (p_city_id IS NOT NULL AND u.city_id = p_city_id)
        OR NOT EXISTS (
          SELECT 1 FROM public.master_service_areas msa WHERE msa.master_id = mp.user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.master_service_areas msa
           WHERE msa.master_id = mp.user_id
             AND xtrud_private.area_matches_place(msa.kind::text, msa.location_id,
                                                  p_city_id, p_district, p_village)
        )
      )
      AND (p_l2_id IS NULL OR EXISTS (
            SELECT 1 FROM public.master_categories x WHERE x.master_id = mp.user_id AND x.l2_id = p_l2_id))
      AND (p_l1_id IS NULL OR EXISTS (
            SELECT 1 FROM public.master_categories x JOIN public.categories_l2 xl2 ON xl2.id = x.l2_id
             WHERE x.master_id = mp.user_id AND xl2.l1_id = p_l1_id))
    GROUP BY mp.user_id, u.first_name, u.last_name, u.avatar_url, u.city_id, c.name, u.district,
             mp.bio, mp.experience_years, mp.rating_overall_avg, mp.rating_overall_count,
             mp.closed_deals, mp.ranking_score, mp.availability_status, mp.verification_level,
             mp.experience_badge_at
  )
  SELECT cand.user_id, cand.first_name, cand.last_name, cand.avatar_url, cand.city_id, cand.city_name,
         cand.district, cand.bio, cand.experience_years, cand.rating_avg, cand.rating_count,
         cand.closed_deals, cand.categories, cand.is_verified, cand.has_experience_badge
  FROM candidates cand, q
  WHERE q.text_query IS NULL
     OR btrim(coalesce(cand.first_name, '') || ' ' || coalesce(cand.last_name, '')) ILIKE '%' || q.text_query || '%'
     OR EXISTS (SELECT 1 FROM unnest(cand.categories) AS category_name WHERE category_name ILIKE '%' || q.text_query || '%')
  ORDER BY
    CASE WHEN p_sort = 'experience' THEN cand.experience_years END DESC NULLS LAST,
    CASE WHEN p_sort = 'availability' THEN
      CASE cand.availability_status::text WHEN 'today' THEN 3 WHEN 'this_week' THEN 2 WHEN 'next_week' THEN 1 ELSE 0 END
    END DESC NULLS LAST,
    -- Проверенные выше (владелец, 2026-10-05, №228): паспорт и «Большой
    -- опыт» — по ступеньке; новички не исчезают, просто ниже.
    (cand.is_verified::int + cand.has_experience_badge::int) DESC,
    cand.ranking_score DESC NULLS LAST,
    cand.closed_deals DESC NULLS LAST,
    cand.rating_avg DESC NULLS LAST,
    -- Уникальный последний ключ: страницы без дублей и пропусков (ревью L3).
    cand.user_id
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$function$;
REVOKE ALL ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text)
  TO anon, authenticated, service_role;

-- 5. Админка: список специалистов с признаками доверия.
DROP FUNCTION public.admin_list_masters(text, integer, integer);
CREATE FUNCTION public.admin_list_masters(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, first_name text, last_name text, phone text, user_status text, master_status text, is_hidden boolean, categories text[], photos_count bigint, rating_avg numeric, rating_count integer, created_at timestamp with time zone, is_verified boolean, has_experience_badge boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT u.id, u.first_name, u.last_name, u.contact_phone, u.status::text,
         mp.status::text, mp.is_hidden_from_search,
         COALESCE((SELECT array_agg(l2.name_ru ORDER BY l2.name_ru)
                     FROM public.master_categories mc JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
                    WHERE mc.master_id = u.id), ARRAY[]::text[]),
         (SELECT count(*) FROM public.portfolio_items pi WHERE pi.master_id = u.id),
         mp.rating_overall_avg, mp.rating_overall_count, mp.created_at,
         (mp.verification_level >= 2), (mp.experience_badge_at IS NOT NULL)
    FROM public.master_profiles mp
    JOIN public.users u ON u.id = mp.user_id
   WHERE public.is_admin_session()
     AND (p_search IS NULL OR btrim(p_search) = ''
          OR u.first_name ILIKE '%' || p_search || '%'
          OR u.last_name ILIKE '%' || p_search || '%'
          OR u.contact_phone ILIKE '%' || p_search || '%')
   ORDER BY mp.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
$function$;
REVOKE ALL ON FUNCTION public.admin_list_masters(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_masters(text, integer, integer) TO authenticated, service_role;

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.master_profiles', 'experience_badge_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_profiles', 'experience_badge_at', 'INSERT')
     OR has_function_privilege('anon', 'public.admin_set_experience_badge(uuid,boolean,text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0225_grants_too_wide';
  END IF;
  IF NOT has_function_privilege('anon', 'public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)', 'EXECUTE')
     OR NOT has_column_privilege('anon', 'public.master_profiles', 'experience_badge_at', 'SELECT') THEN
    RAISE EXCEPTION '0225_lost_needed_access';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
