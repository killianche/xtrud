-- Поиск специалистов для вкладки «Специалисты».
--
-- DECISION владельца 2026-09-03: «где можно искать аккаунты по именам или
-- категориям или ещё по другим вариантам. Должно быть просто и быстро».
--
-- Почему функция, а не запрос из приложения: искать надо по имени И по
-- названию категории одновременно, а категории лежат в отдельной таблице.
-- Клиентом это либо два-три запроса с дофильтровкой на устройстве, либо
-- выгрузка всех мастеров ради поиска по трём буквам. Один вызов с готовым
-- ответом — это и есть «просто и быстро» (.claude/rules/design-quality.md §1.2).
--
-- Функция отдаёт РОВНО те колонки, которые и так публичны: имя, фамилия,
-- аватар, город, район, рейтинг, опыт. Телефона и почты здесь нет —
-- контакты открываются только на карточке мастера своим механизмом.
--
-- Пустой запрос — это витрина: возвращаем всех активных по рейтингу. Так
-- вкладка открывается сразу со списком, а не с пустотой (§1.2, «экран
-- открывается на том, что уже есть»).

BEGIN;

CREATE OR REPLACE FUNCTION public.search_masters(
  p_query     text DEFAULT NULL,
  p_l2_id     text DEFAULT NULL,
  p_city_id   text DEFAULT NULL,
  p_hide_demo boolean DEFAULT true,
  p_limit     integer DEFAULT 30,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE (
  user_id          uuid,
  first_name       text,
  last_name        text,
  avatar_url       text,
  city_id          text,
  city_name        text,
  district         text,
  bio              text,
  experience_years integer,
  rating_avg       numeric,
  rating_count     integer,
  closed_deals     integer,
  categories       text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT nullif(btrim(coalesce(p_query, '')), '') AS text_query
  ),
  candidates AS (
    SELECT
      mp.user_id,
      u.first_name,
      u.last_name,
      u.avatar_url,
      u.city_id,
      c.name        AS city_name,
      u.district,
      mp.bio,
      mp.experience_years,
      mp.rating_overall_avg   AS rating_avg,
      mp.rating_overall_count AS rating_count,
      mp.closed_deals,
      mp.ranking_score,
      -- Названия категорий нужны и для показа в карточке, и для поиска:
      -- «электрик» должен находить людей из категории «Электрика».
      coalesce(
        array_agg(DISTINCT l2.name_ru) FILTER (WHERE l2.name_ru IS NOT NULL),
        ARRAY[]::text[]
      ) AS categories
    FROM public.master_profiles mp
    JOIN public.users u ON u.id = mp.user_id
    LEFT JOIN public.cities c ON c.id = u.city_id
    LEFT JOIN public.master_categories mc ON mc.master_id = mp.user_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
    WHERE mp.status = 'active'
      AND coalesce(mp.is_hidden_from_search, false) = false
      AND u.status = 'active'
      AND u.onboarding_completed_at IS NOT NULL
      AND (NOT p_hide_demo OR coalesce(u.is_demo, false) = false)
      AND (p_city_id IS NULL OR u.city_id = p_city_id)
      AND (
        p_l2_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.master_categories x
           WHERE x.master_id = mp.user_id AND x.l2_id = p_l2_id
        )
      )
    GROUP BY mp.user_id, u.first_name, u.last_name, u.avatar_url, u.city_id,
             c.name, u.district, mp.bio, mp.experience_years,
             mp.rating_overall_avg, mp.rating_overall_count, mp.closed_deals,
             mp.ranking_score
  )
  SELECT
    cand.user_id, cand.first_name, cand.last_name, cand.avatar_url,
    cand.city_id, cand.city_name, cand.district, cand.bio,
    cand.experience_years, cand.rating_avg, cand.rating_count,
    cand.closed_deals, cand.categories
  FROM candidates cand, q
  WHERE q.text_query IS NULL
     -- Совпадение по имени, фамилии или названию любой его категории.
     OR btrim(coalesce(cand.first_name, '') || ' ' || coalesce(cand.last_name, ''))
        ILIKE '%' || q.text_query || '%'
     OR EXISTS (
       SELECT 1 FROM unnest(cand.categories) AS category_name
        WHERE category_name ILIKE '%' || q.text_query || '%'
     )
  ORDER BY cand.ranking_score DESC NULLS LAST,
           cand.closed_deals DESC NULLS LAST,
           cand.rating_avg DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

-- Каталог специалистов открыт и без входа — как и лента заданий.
REVOKE ALL ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer)
  TO anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.search_masters(text, text, text, boolean, integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'search_masters не создана';
  END IF;
  RAISE NOTICE 'search_masters создана, доступна anon и authenticated.';
END
$$;

COMMIT;
