-- 0213: откат 0212_place_village (село в задании, справочники районов/сёл,
--       нормализация legacy-городов, правило совпадения места).
--
-- Когда применять: только по команде владельца, если 0212 сломала рассылку,
-- поиск или публикацию. Безопасен до выхода клиента, который пишет
-- orders.village. После выхода такого клиента откат удалит колонку, и новая
-- сборка перестанет публиковать задание с селом (PostgREST: неизвестная
-- колонка) — тогда сначала нужна сборка без village или откат только функций
-- (разделы 2–3 этого файла без разделов 4–6).
--
-- Что делает:
--   1. Сохраняет в xtrud_private.backup_0213_village все задания с селом
--      (id, district, village, updated_at) — информация о селе не теряется.
--   2. Возвращает живые тела 2026-10-03 (снимок до 0212):
--      process_order_broadcast_queue, search_masters (старая сигнатура из 8
--      аргументов, гранты anon/authenticated/service_role + PUBLIC по
--      умолчанию), set_master_service_areas.
--   3. Удаляет триггер orders_normalize_place; orders_author_active_guard —
--      прежний список колонок без village.
--   4. Данные (updated_at не меняется, set_updated_at выключен на время):
--      - задания из backup_0212_place, которые не менялись после 0212
--        (updated_at совпадает), — прежние city_id/district;
--      - прочие задания с селом Серноводская/Нестеровская (их могла
--        нормализовать 0212 из записи старой сборки) — city_id legacy-id,
--        district NULL (так их писали старые сборки);
--      - остальные задания с селом остаются «весь район» (district
--        сохраняется, видны фильтру района у всех сборок);
--      - зона Орджоникидзевская из backup_0212_place, если строка жива и всё
--        ещё 'sunzha';
--      - три строки district_cities Сунженского района.
--   5. Удаляет ограничения и колонку orders.village, функции xtrud_private
--      (place_matches, area_matches_place, orders_normalize_place,
--      place_normalize), таблицы district_villages, districts.
--   6. backup_0212_place и backup_0213_village оставляет (аудит; удаление —
--      отдельно, после подтверждения владельца).
--
-- Не возвращается: зоны, которые специалист пересохранил после 0212
-- (Орджоникидзевская сохранилась как Сунжа — это тот же населённый пункт).
-- Перед применением: pg_dump -n public -n xtrud_api -n xtrud_private -Fc >
--   /opt/xtrud/backups/pre-0213-<ts>.dump.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0213_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.backup_0212_place') IS NULL
     OR to_regclass('public.district_villages') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'village') THEN
    RAISE EXCEPTION '0213_0212_not_applied';
  END IF;
  IF to_regclass('xtrud_private.backup_0213_village') IS NOT NULL THEN
    RAISE EXCEPTION '0213_already_applied';
  END IF;
  IF pg_get_function_identity_arguments('public.search_masters'::regproc)
     <> 'p_query text, p_l2_id text, p_city_id text, p_hide_demo boolean, p_limit integer, p_offset integer, p_l1_id text, p_sort text, p_district text, p_village text' THEN
    RAISE EXCEPTION '0213_search_masters_signature_unexpected';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Резерв сёл.
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.backup_0213_village AS
SELECT o.id, o.city_id, o.district, o.village, o.updated_at, now() AS saved_at
  FROM public.orders o
 WHERE o.village IS NOT NULL;
ALTER TABLE xtrud_private.backup_0213_village ADD PRIMARY KEY (id);
REVOKE ALL ON xtrud_private.backup_0213_village FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Функции — живые тела 2026-10-03 (до 0212).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_order_broadcast_queue(p_batch integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        JOIN public.users u ON u.id = mp.user_id
        WHERE mp.status = 'active'
          -- Мастер любой из категорий задания (0195), одно уведомление на человека.
          AND EXISTS (
            SELECT 1 FROM public.master_categories mc
             WHERE mc.master_id = mp.user_id
               AND (mc.l2_id = v_order.l2_id OR mc.l2_id = ANY (v_order.extra_l2_ids))
          )
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
$function$;

DROP FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text);

CREATE FUNCTION public.search_masters(p_query text DEFAULT NULL::text, p_l2_id text DEFAULT NULL::text, p_city_id text DEFAULT NULL::text, p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_l1_id text DEFAULT NULL::text, p_sort text DEFAULT 'rating'::text)
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

GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_master_service_areas(p_cities text[], p_districts text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_master_id uuid;
  v_city text;
  v_district text;
BEGIN
  v_master_id := auth.uid();
  IF v_master_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = 'P0001';
  END IF;

  DELETE FROM public.master_service_areas WHERE master_id = v_master_id;

  IF p_cities IS NOT NULL THEN
    FOREACH v_city IN ARRAY p_cities LOOP
      INSERT INTO public.master_service_areas (master_id, kind, location_id)
      VALUES (v_master_id, 'city', v_city);
    END LOOP;
  END IF;

  IF p_districts IS NOT NULL THEN
    FOREACH v_district IN ARRAY p_districts LOOP
      INSERT INTO public.master_service_areas (master_id, kind, location_id)
      VALUES (v_master_id, 'district', v_district);
    END LOOP;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Триггеры.
-- ---------------------------------------------------------------------------
DROP TRIGGER orders_normalize_place ON public.orders;
DROP TRIGGER orders_author_active_guard ON public.orders;
CREATE TRIGGER orders_author_active_guard
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_author_active(
    'title', 'description', 'photo_urls', 'contact_name', 'l2_id', 'city_id', 'district');

-- ---------------------------------------------------------------------------
-- 4. Данные.
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders DISABLE TRIGGER orders_set_updated_at;

-- 4.1 Задания из резерва 0212, не менявшиеся после неё.
UPDATE public.orders o
   SET city_id  = b.data->>'city_id',
       district = b.data->>'district',
       village  = NULL
  FROM xtrud_private.backup_0212_place b
 WHERE b.tbl = 'orders'
   AND o.id::text = b.row_key
   AND o.updated_at = (b.data->>'updated_at')::timestamptz;

-- 4.2 Серноводская/Нестеровская после 0212 — как писали старые сборки.
UPDATE public.orders
   SET city_id  = CASE village WHEN 'Серноводская' THEN 'sernovodskaya' ELSE 'nesterovskaya' END,
       district = NULL,
       village  = NULL
 WHERE village IN ('Серноводская', 'Нестеровская')
   AND district = 'Сунженский район';

-- 4.3 Остальные сёла — «весь район» (district остаётся).
UPDATE public.orders SET village = NULL WHERE village IS NOT NULL;

ALTER TABLE public.orders ENABLE TRIGGER orders_set_updated_at;

-- 4.4 Зона Орджоникидзевская.
UPDATE public.master_service_areas a
   SET location_id = b.data->>'location_id'
  FROM xtrud_private.backup_0212_place b
 WHERE b.tbl = 'master_service_areas'
   AND a.id::text = b.row_key
   AND a.kind = 'city'
   AND a.location_id = 'sunzha'
   AND NOT EXISTS (SELECT 1 FROM public.master_service_areas x
                    WHERE x.master_id = a.master_id AND x.kind = 'city'
                      AND x.location_id = b.data->>'location_id');

-- 4.5 district_cities.
INSERT INTO public.district_cities (district_id, district_name, city_id)
SELECT b.data->>'district_id', b.data->>'district_name', b.data->>'city_id'
  FROM xtrud_private.backup_0212_place b
 WHERE b.tbl = 'district_cities'
ON CONFLICT (district_id, city_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Схема.
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT orders_village_in_district;
ALTER TABLE public.orders DROP CONSTRAINT orders_village_needs_district;
ALTER TABLE public.orders DROP CONSTRAINT orders_village_check;
ALTER TABLE public.orders DROP COLUMN village;

DROP FUNCTION xtrud_private.area_matches_place(text, text, text, text, text);
DROP FUNCTION xtrud_private.place_matches(text, text, text, text, text, text);
DROP FUNCTION xtrud_private.orders_normalize_place();
DROP FUNCTION xtrud_private.place_normalize(text, text, text);

DROP TABLE public.district_villages;
DROP TABLE public.districts;

-- ---------------------------------------------------------------------------
-- 6. Пост-проверки.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF pg_get_function_identity_arguments('public.search_masters'::regproc)
     <> 'p_query text, p_l2_id text, p_city_id text, p_hide_demo boolean, p_limit integer, p_offset integer, p_l1_id text, p_sort text' THEN
    RAISE EXCEPTION '0213_search_masters_not_restored';
  END IF;
  IF NOT has_function_privilege('anon', 'public.search_masters(text,text,text,boolean,integer,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0213_search_masters_grant_missing';
  END IF;
  IF position('area_covers_place' IN pg_get_functiondef('public.process_order_broadcast_queue'::regproc)) = 0 THEN
    RAISE EXCEPTION '0213_broadcast_not_restored';
  END IF;
  IF (SELECT count(*) FROM public.district_cities WHERE district_id = 'sunzhensky') <> 4 THEN
    RAISE EXCEPTION '0213_district_cities_not_restored';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass
                AND tgname = 'orders_normalize_place') THEN
    RAISE EXCEPTION '0213_normalize_trigger_left';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
