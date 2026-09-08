-- 0176: галочка «Показывать меня среди специалистов» (DECISION владельца
-- 2026-09-08). is_hidden_from_search пересчитывает try_publish_master при
-- каждой смене категорий — значит собственное решение человека «скрыться»
-- сбрасывалось бы. Отдельная колонка hidden_by_owner: её трогает только сам
-- человек, каталог (search_masters) её учитывает.

BEGIN;

ALTER TABLE public.master_profiles
  ADD COLUMN IF NOT EXISTS hidden_by_owner boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.master_profiles.hidden_by_owner IS
  'Специалист сам снял галочку «Показывать меня среди специалистов». Не пересчитывается автоматикой.';
GRANT UPDATE (hidden_by_owner) ON public.master_profiles TO authenticated;

DROP FUNCTION IF EXISTS public.search_masters(text, text, text, boolean, integer, integer, text, text);
CREATE FUNCTION public.search_masters(
  p_query text DEFAULT NULL, p_l2_id text DEFAULT NULL, p_city_id text DEFAULT NULL,
  p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0,
  p_l1_id text DEFAULT NULL, p_sort text DEFAULT 'rating'
)
RETURNS TABLE(
  user_id uuid, first_name text, last_name text, avatar_url text, city_id text,
  city_name text, district text, bio text, experience_years integer,
  rating_avg numeric, rating_count integer, closed_deals integer, categories text[],
  is_verified boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
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
      AND (p_city_id IS NULL OR u.city_id = p_city_id)
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
$$;
GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text)
  TO anon, authenticated, service_role;

COMMIT;
