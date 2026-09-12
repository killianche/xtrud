-- 0192 — район включает свои города.
--
-- ЗАЧЕМ (владелец, 2026-09-12): «Малгобек входит в Малгобекский район,
-- Назрань и Магас — в Назрановский. Если человек выбрал Назрановский район,
-- туда входит и Назрань, и Магас».
--
-- FACT, что было не так:
--  1. У задания хранится ЛИБО город (`orders.city_id`), ЛИБО район
--     (`orders.district`, русским названием) — и они нигде не связаны.
--  2. У специалиста зона работы хранится идентификатором района
--     (`master_service_areas.location_id = 'nazranovsky'`), а у задания —
--     названием. Даже совпадение «район в район» не срабатывало.
--  3. Рассылка новых заданий сверяла только город: `msa.kind = 'city' AND
--     location_id = order.city_id`. Специалист, выбравший район, не получал
--     ничего.
--
-- Решение: одна таблица соответствия и одна функция совпадения, которой
-- пользуются и рассылка, и поиск специалистов.

BEGIN;

CREATE TABLE IF NOT EXISTS public.district_cities (
  district_id   text NOT NULL,
  district_name text NOT NULL,
  city_id       text NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  PRIMARY KEY (district_id, city_id)
);

COMMENT ON TABLE public.district_cities IS
  'Какие города входят в район. district_id — как в приложении (nazranovsky), district_name — как в orders.district.';

-- Справочник маленький и меняется руками вместе с приложением.
DELETE FROM public.district_cities;
INSERT INTO public.district_cities (district_id, district_name, city_id) VALUES
  ('nazranovsky',  'Назрановский район',  'nazran-magas'),
  ('nazranovsky',  'Назрановский район',  'nazran'),
  ('nazranovsky',  'Назрановский район',  'magas'),
  ('malgobeksky',  'Малгобекский район',  'malgobek'),
  ('sunzhensky',   'Сунженский район',    'sunzha'),
  ('sunzhensky',   'Сунженский район',    'ordzhonikidzevskaya'),
  ('sunzhensky',   'Сунженский район',    'sernovodskaya'),
  ('sunzhensky',   'Сунженский район',    'nesterovskaya');
-- Джейрахский район — только сёла, городов нет. Карабулак — отдельный
-- городской округ и ни в один район не входит.

GRANT SELECT ON public.district_cities TO anon, authenticated;
ALTER TABLE public.district_cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS district_cities_read_all ON public.district_cities;
CREATE POLICY district_cities_read_all ON public.district_cities FOR SELECT USING (true);

/**
 * Подходит ли зона работы специалиста к месту задания.
 *
 * Зона «город» подходит, если задание в этом городе или охватывает район,
 * в который город входит. Зона «район» подходит, если задание в этом районе
 * или в одном из его городов.
 */
CREATE OR REPLACE FUNCTION public.area_covers_place(
  p_area_kind text,
  p_area_location_id text,
  p_city_id text,
  p_district text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_area_kind = 'city' THEN
      p_area_location_id = p_city_id
      OR EXISTS (
        SELECT 1 FROM public.district_cities dc
         WHERE dc.city_id = p_area_location_id
           AND dc.district_name = p_district
      )
    WHEN p_area_kind = 'district' THEN
      EXISTS (
        SELECT 1 FROM public.district_cities dc
         WHERE dc.district_id = p_area_location_id
           AND (dc.city_id = p_city_id OR dc.district_name = p_district)
      )
    ELSE false
  END;
$$;

-- Рассылка «Новая заявка»: город, район и «вся Ингушетия» (зон нет).
CREATE OR REPLACE FUNCTION public.process_order_broadcast_queue(p_batch integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item record;
  v_order public.orders%ROWTYPE;
  v_category_name text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_master record;
  v_done int := 0;
BEGIN
  FOR v_item IN
    SELECT order_id FROM public.order_broadcast_queue
    WHERE attempts < 3
    ORDER BY queued_at
    LIMIT p_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
    -- Задание уже закрыто или удалено — рассылать нечего.
    IF NOT FOUND OR v_order.status <> 'open' THEN
      DELETE FROM public.order_broadcast_queue WHERE order_id = v_item.order_id;
      CONTINUE;
    END IF;

    SELECT cl2.name_ru INTO v_category_name FROM public.categories_l2 cl2 WHERE cl2.id = v_order.l2_id;
    v_title := CASE WHEN v_category_name IS NOT NULL THEN 'Новая заявка: ' || v_category_name ELSE 'Новая заявка' END;
    v_body := left(v_order.title, 80);
    v_data := jsonb_build_object('kind', 'new_order', 'order_id', v_order.id, 'l2_id', v_order.l2_id, 'city_id', v_order.city_id);

    BEGIN
      FOR v_master IN
        SELECT mp.user_id
        FROM public.master_profiles mp
        JOIN public.master_categories mc ON mc.master_id = mp.user_id AND mc.l2_id = v_order.l2_id
        JOIN public.users u ON u.id = mp.user_id
        WHERE mp.status = 'active'
          AND u.status = 'active'
          AND COALESCE(mp.is_hidden_from_search, false) = false
          AND mp.user_id <> v_order.client_id
          AND (
            -- Зон нет — работает по всей Ингушетии.
            NOT EXISTS (SELECT 1 FROM public.master_service_areas msa WHERE msa.master_id = mp.user_id)
            OR EXISTS (
              SELECT 1 FROM public.master_service_areas msa
               WHERE msa.master_id = mp.user_id
                 AND public.area_covers_place(msa.kind::text, msa.location_id, v_order.city_id, v_order.district)
            )
          )
      LOOP
        PERFORM public.notify_user(v_master.user_id, v_title, v_body, v_data);
      END LOOP;
      DELETE FROM public.order_broadcast_queue WHERE order_id = v_item.order_id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.order_broadcast_queue SET attempts = attempts + 1 WHERE order_id = v_item.order_id;
      RAISE WARNING 'order_broadcast %: %', v_item.order_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_done;
END;
$$;

-- Поиск специалистов: «Где работаете» наконец влияет на выдачу. Раньше
-- фильтр по городу сверял только город самого специалиста, а зоны
-- работы не участвовали вовсе (FACT 2026-09-12).
CREATE OR REPLACE FUNCTION public.search_masters(p_query text DEFAULT NULL::text, p_l2_id text DEFAULT NULL::text, p_city_id text DEFAULT NULL::text, p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_l1_id text DEFAULT NULL::text, p_sort text DEFAULT 'rating'::text)
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
      -- Место (0192): город самого специалиста, либо его зона работы
      -- покрывает выбранный город — в том числе через район, в который
      -- город входит, — либо зон нет вовсе: «вся Ингушетия».
      AND (
        p_city_id IS NULL
        OR u.city_id = p_city_id
        OR NOT EXISTS (
          SELECT 1 FROM public.master_service_areas msa WHERE msa.master_id = mp.user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.master_service_areas msa
           WHERE msa.master_id = mp.user_id
             AND public.area_covers_place(msa.kind::text, msa.location_id, p_city_id, NULL)
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

COMMIT;
