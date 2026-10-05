-- 0225 откат: убрать значок, вернуть поиск и список админки как до 0225.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION '0225_rollback_must_run_as_postgres'; END IF;
  IF to_regprocedure('public.admin_set_experience_badge(uuid,boolean,text)') IS NULL THEN
    RAISE EXCEPTION '0225_not_applied';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.admin_set_experience_badge(uuid, boolean, text);
DROP FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text);
CREATE FUNCTION public.search_masters(p_query text DEFAULT NULL::text, p_l2_id text DEFAULT NULL::text, p_city_id text DEFAULT NULL::text, p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_l1_id text DEFAULT NULL::text, p_sort text DEFAULT 'rating'::text, p_district text DEFAULT NULL::text, p_village text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar_url text, city_id text, city_name text, district text, bio text, experience_years integer, rating_avg numeric, rating_count integer, closed_deals integer, categories text[], is_verified boolean)
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
             mp.closed_deals, mp.ranking_score, mp.availability_status, mp.verification_level
  )
  SELECT cand.user_id, cand.first_name, cand.last_name, cand.avatar_url, cand.city_id, cand.city_name,
         cand.district, cand.bio, cand.experience_years, cand.rating_avg, cand.rating_count,
         cand.closed_deals, cand.categories, cand.is_verified
  FROM candidates cand, q
  WHERE q.text_query IS NULL
     OR btrim(coalesce(cand.first_name, '') || ' ' || coalesce(cand.last_name, '')) ILIKE '%' || q.text_query || '%'
     OR EXISTS (SELECT 1 FROM unnest(cand.categories) AS category_name WHERE category_name ILIKE '%' || q.text_query || '%')
  ORDER BY
    CASE WHEN p_sort = 'experience' THEN cand.experience_years END DESC NULLS LAST,
    CASE WHEN p_sort = 'availability' THEN
      CASE cand.availability_status::text WHEN 'today' THEN 3 WHEN 'this_week' THEN 2 WHEN 'next_week' THEN 1 ELSE 0 END
    END DESC NULLS LAST,
    cand.ranking_score DESC NULLS LAST,
    cand.closed_deals DESC NULLS LAST,
    cand.rating_avg DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$function$;
REVOKE ALL ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text)
  TO anon, authenticated, service_role;
DROP FUNCTION public.admin_list_masters(text, integer, integer);
CREATE FUNCTION public.admin_list_masters(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, first_name text, last_name text, phone text, user_status text, master_status text, is_hidden boolean, categories text[], photos_count bigint, rating_avg numeric, rating_count integer, created_at timestamp with time zone)
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
         mp.rating_overall_avg, mp.rating_overall_count, mp.created_at
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
-- Колонку НЕ удаляем (ревью M1): сборка 130+ читает experience_badge_at в
-- карточке специалиста — без колонки карточка не откроется. Значки снимаются
-- обнулением: UPDATE public.master_profiles SET experience_badge_at = NULL;
-- Журнал: записи experience_badge_* остаются; CHECK не сужается, чтобы их не потерять.
NOTIFY pgrst, 'reload schema';
COMMIT;
