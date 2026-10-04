-- 0212: село как уровень места задания; Орджоникидзевская = Сунжа;
--       Серноводская и Нестеровская — сёла Сунженского района.
--
-- DECISION владельца 2026-10-03 (docs/LOCATION_MODEL_2026-10.md, вариант A):
--   Q1  ordzhonikidzevskaya сливается с sunzha везде: задания, зоны
--       специалистов, нормализация записей старых сборок.
--   Q2  sernovodskaya, nesterovskaya → district 'Сунженский район' +
--       village 'Серноводская' / 'Нестеровская'.
--   Q3  задание «Вся Ингушетия» (city_id и district NULL) специалистам с
--       выбранным местом НЕ показывается и в рассылку не попадает — как сейчас.
--   Зона специалиста — «весь район» или город (сёла как зоны — не этот этап).
--   Место задания — ровно одно из: вся РИ | город | весь район | село района.
--   Правило совпадения: район включает свои города и сёла; задание в селе
--   совпадает с его районом и с самим селом; город и село одного района не
--   совпадают; специалист без зон видит всё.
--   Старые сборки (читают/пишут city_id и district) не ломаются; три строки
--   cities не удаляются и не выключаются.
--
-- Живое состояние (read-only снимок 2026-10-03, PostgreSQL 17.6):
--   orders 18; city_id='sernovodskaya' — 1 (completed); ordzhonikidzevskaya,
--   nesterovskaya — 0; district не из 4 имён районов — 0; city_id и district
--   вместе — 0.
--   master_service_areas: city:ordzhonikidzevskaya — 1 (у этого специалиста нет
--   city:sunzha); city:sernovodskaya|nesterovskaya — 0; district:nazranovsky 1,
--   district:sunzhensky 1.
--   users: city_id/district заполнены у 0 из 14.
--   district_cities: sunzhensky → sunzha, ordzhonikidzevskaya, sernovodskaya,
--   nesterovskaya. Джейрахского района нет, и добавить его туда нельзя:
--   PK (district_id, city_id), city_id NOT NULL FK → cities, а городов у
--   района нет. Поэтому id → имя района берётся из нового справочника
--   public.districts (до 0212 зона district:dzheirakhsky не совпадала ни с чем).
--   Default privileges postgres в public: новой таблице authenticated получает
--   SELECT/REFERENCES/TRIGGER/MAINTAIN, функции — EXECUTE; плюс PUBLIC EXECUTE
--   на любую новую функцию. Ниже всё это явно отзывается.
--
-- Было → стало:
--   orders: + village text (CHECK длина 1..60; только при district и без
--     city_id; FK (district, village) → district_villages — мусор отвергается).
--   + public.districts (4 района), public.district_villages (сёла из
--     src/lib/location-config.ts DISTRICTS + Серноводская в Сунженском) —
--     только чтение для anon/authenticated.
--   district_cities: из Сунженского района уходят три legacy-«города».
--   + BEFORE-триггер orders_normalize_place (для старых сборок):
--       city_id ordzhonikidzevskaya → sunzha;
--       city_id sernovodskaya|nesterovskaya → district + village;
--       district = имя села → district района + village;
--       старая сборка сменила место, не зная о village → village очищается.
--   orders_author_active_guard: + 'village' (ограниченный автор не меняет село).
--   process_order_broadcast_queue, search_masters: area_covers_place →
--     xtrud_private.area_matches_place (правило выше, учитывает village).
--     search_masters: + p_district, p_village DEFAULT NULL (DROP + CREATE;
--     вызов по именам у старых сборок не меняется).
--   set_master_service_areas: city ordzhonikidzevskaya → sunzha, дубль — пропуск.
--   Данные: 1 задание (sernovodskaya → село), 1 зона (ordzh → sunzha).
--   area_covers_place не удаляется (после 0212 не вызывается; удаление —
--   отдельная миграция после наблюдения).
--
-- Резерв: xtrud_private.backup_0212_place (orders.id/city_id/district/
--   updated_at, master_service_areas.id/kind/location_id, удалённые строки
--   district_cities). Откат — 0213_place_village_rollback.sql.
-- До применения: pg_dump -n public -n xtrud_api -n xtrud_private -Fc >
--   /opt/xtrud/backups/pre-0212-<ts>.dump; заново снять pg_get_functiondef
--   четырёх функций и сравнить с телами ниже (0213 восстанавливает тела от
--   снимка 2026-10-03).

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Предусловия: живое состояние совпадает с тем, от которого писалась миграция.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Владелец пересоздаваемых SECURITY DEFINER-функций — тот, кто применяет;
  -- только postgres, не суперпользователь (ревью xtrud-security 2026-10-03).
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0212_must_run_as_postgres';
  END IF;
  IF to_regclass('public.districts') IS NOT NULL
     OR to_regclass('public.district_villages') IS NOT NULL
     OR to_regclass('xtrud_private.backup_0212_place') IS NOT NULL THEN
    RAISE EXCEPTION '0212_already_applied_or_name_taken';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'village') THEN
    RAISE EXCEPTION '0212_orders_village_exists';
  END IF;
  IF (SELECT count(*) FROM public.cities
       WHERE id IN ('sunzha', 'ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya')) <> 4 THEN
    RAISE EXCEPTION '0212_cities_rows_missing';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'search_masters'
        AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION '0212_search_masters_overloaded';
  END IF;
  IF pg_get_function_identity_arguments('public.search_masters'::regproc)
     <> 'p_query text, p_l2_id text, p_city_id text, p_hide_demo boolean, p_limit integer, p_offset integer, p_l1_id text, p_sort text' THEN
    RAISE EXCEPTION '0212_search_masters_signature_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders
              WHERE city_id IS NOT NULL AND district IS NOT NULL) THEN
    RAISE EXCEPTION '0212_orders_with_city_and_district';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Резерв данных, которые миграция меняет (без персональных данных).
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.backup_0212_place (
  tbl      text        NOT NULL,
  row_key  text        NOT NULL,
  data     jsonb       NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tbl, row_key)
);
REVOKE ALL ON xtrud_private.backup_0212_place FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO xtrud_private.backup_0212_place (tbl, row_key, data)
SELECT 'orders', o.id::text,
       jsonb_build_object('city_id', o.city_id, 'district', o.district, 'updated_at', o.updated_at)
  FROM public.orders o
 WHERE o.city_id IN ('ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya')
UNION ALL
SELECT 'master_service_areas', a.id::text,
       jsonb_build_object('master_id', a.master_id, 'kind', a.kind::text, 'location_id', a.location_id)
  FROM public.master_service_areas a
 WHERE a.kind = 'city' AND a.location_id = 'ordzhonikidzevskaya'
UNION ALL
SELECT 'district_cities', dc.district_id || ':' || dc.city_id,
       jsonb_build_object('district_id', dc.district_id, 'district_name', dc.district_name, 'city_id', dc.city_id)
  FROM public.district_cities dc
 WHERE dc.city_id IN ('ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya');

-- ---------------------------------------------------------------------------
-- 2. Справочники районов и сёл.
-- ---------------------------------------------------------------------------
CREATE TABLE public.districts (
  id         text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 50),
  name       text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 60),
  sort_order int  NOT NULL DEFAULT 0,
  UNIQUE (id, name)
);

INSERT INTO public.districts (id, name, sort_order) VALUES
  ('nazranovsky',  'Назрановский район', 1),
  ('sunzhensky',   'Сунженский район',   2),
  ('malgobeksky',  'Малгобекский район', 3),
  ('dzheirakhsky', 'Джейрахский район',  4);

CREATE TABLE public.district_villages (
  district_id   text NOT NULL,
  district_name text NOT NULL,
  village_name  text NOT NULL CHECK (length(village_name) BETWEEN 1 AND 60),
  sort_order    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (district_id, village_name),
  UNIQUE (district_name, village_name),
  -- Имя села однозначно определяет район: нормализация «district = имя села»
  -- и вывод района по селу опираются на это.
  UNIQUE (village_name),
  FOREIGN KEY (district_id, district_name)
    REFERENCES public.districts (id, name) ON UPDATE CASCADE
);

-- Порядок и написание — копия DISTRICTS из src/lib/location-config.ts
-- (снимок 2026-10-03) + Серноводская в Сунженском (Q2). Нестеровская в
-- клиентском списке уже есть.
INSERT INTO public.district_villages (district_id, district_name, village_name, sort_order) VALUES
  ('nazranovsky',  'Назрановский район', 'Экажево',          1),
  ('nazranovsky',  'Назрановский район', 'Яндаре',           2),
  ('nazranovsky',  'Назрановский район', 'Плиево',           3),
  ('nazranovsky',  'Назрановский район', 'Сурхахи',          4),
  ('nazranovsky',  'Назрановский район', 'Кантышево',        5),
  ('nazranovsky',  'Назрановский район', 'Долаково',         6),
  ('nazranovsky',  'Назрановский район', 'Барсуки',          7),
  ('nazranovsky',  'Назрановский район', 'Альтиево',         8),
  ('nazranovsky',  'Назрановский район', 'Гамурзиево',       9),
  ('nazranovsky',  'Назрановский район', 'Али-Юрт',         10),
  ('sunzhensky',   'Сунженский район',   'Алхасты',          1),
  ('sunzhensky',   'Сунженский район',   'Аршты',            2),
  ('sunzhensky',   'Сунженский район',   'Берд-Юрт',         3),
  ('sunzhensky',   'Сунженский район',   'Галашки',          4),
  ('sunzhensky',   'Сунженский район',   'Даттых',           5),
  ('sunzhensky',   'Сунженский район',   'Нестеровская',     6),
  ('sunzhensky',   'Сунженский район',   'Серноводская',     7),
  ('sunzhensky',   'Сунженский район',   'Чемульга',         8),
  ('malgobeksky',  'Малгобекский район', 'Зязиков-Юрт',      1),
  ('malgobeksky',  'Малгобекский район', 'Инарки',           2),
  ('malgobeksky',  'Малгобекский район', 'Сагопши',          3),
  ('malgobeksky',  'Малгобекский район', 'Пседах',           4),
  ('malgobeksky',  'Малгобекский район', 'Верхние Ачалуки',  5),
  ('malgobeksky',  'Малгобекский район', 'Средние Ачалуки',  6),
  ('malgobeksky',  'Малгобекский район', 'Нижние Ачалуки',   7),
  ('malgobeksky',  'Малгобекский район', 'Аки-Юрт',          8),
  ('dzheirakhsky', 'Джейрахский район',  'Джейрах',          1),
  ('dzheirakhsky', 'Джейрахский район',  'Ляжги',            2),
  ('dzheirakhsky', 'Джейрахский район',  'Армхи',            3),
  ('dzheirakhsky', 'Джейрахский район',  'Ольгети',          4),
  ('dzheirakhsky', 'Джейрахский район',  'Гули',             5),
  ('dzheirakhsky', 'Джейрахский район',  'Бейни',            6),
  ('dzheirakhsky', 'Джейрахский район',  'Эгикал',           7),
  ('dzheirakhsky', 'Джейрахский район',  'Тарш',             8);

-- Справочники: читать всем, писать никому из API (fail-closed: RLS без
-- политик записи и без грантов записи).
ALTER TABLE public.districts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.district_villages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.districts, public.district_villages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.districts, public.district_villages TO anon, authenticated, service_role;
CREATE POLICY districts_read_all         ON public.districts         FOR SELECT USING (true);
CREATE POLICY district_villages_read_all ON public.district_villages FOR SELECT USING (true);

-- Район включает только свой настоящий город: legacy-«города» уходят.
DELETE FROM public.district_cities
 WHERE district_id = 'sunzhensky'
   AND city_id IN ('ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya');

-- ---------------------------------------------------------------------------
-- 3. Колонка села у задания.
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN village text;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_village_check
  CHECK (village IS NULL OR length(village) BETWEEN 1 AND 60);
ALTER TABLE public.orders
  ADD CONSTRAINT orders_village_needs_district
  CHECK (village IS NULL OR (district IS NOT NULL AND city_id IS NULL));
-- MATCH SIMPLE: при village IS NULL не проверяется — старые строки валидны.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_village_in_district
  FOREIGN KEY (district, village)
  REFERENCES public.district_villages (district_name, village_name);

-- Колоночные гранты — как у city_id/district. SELECT у anon и authenticated
-- на orders табличный, новая колонка читается без отдельного гранта.
GRANT INSERT (village), UPDATE (village) ON public.orders TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Нормализация места (одна точка правды для триггера и совпадений).
-- ---------------------------------------------------------------------------
-- Чистая функция: legacy-id города → город/село; имя села в district → село;
-- село без района → район по справочнику. Не очищает и не проверяет — это
-- делают триггер и ограничения.
CREATE FUNCTION xtrud_private.place_normalize(
  p_city_id text, p_district text, p_village text,
  OUT city_id text, OUT district text, OUT village text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_district text;
BEGIN
  city_id  := p_city_id;
  district := p_district;
  village  := p_village;

  -- Q1/Q2: устаревшие id «городов».
  IF city_id = 'ordzhonikidzevskaya' THEN
    city_id := 'sunzha';
  ELSIF city_id IN ('sernovodskaya', 'nesterovskaya') THEN
    district := 'Сунженский район';
    village  := CASE city_id WHEN 'sernovodskaya' THEN 'Серноводская' ELSE 'Нестеровская' END;
    city_id  := NULL;
  END IF;

  -- Имя села в колонке района (старый клиент это допускал).
  IF city_id IS NULL AND village IS NULL AND district IS NOT NULL THEN
    SELECT dv.district_name INTO v_district
      FROM public.district_villages dv WHERE dv.village_name = district;
    IF FOUND THEN
      village  := district;
      district := v_district;
    END IF;
  END IF;

  -- Село без района: район однозначен (UNIQUE village_name).
  IF city_id IS NULL AND village IS NOT NULL AND district IS NULL THEN
    SELECT dv.district_name INTO v_district
      FROM public.district_villages dv WHERE dv.village_name = village;
    IF FOUND THEN
      district := v_district;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION xtrud_private.place_normalize(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
-- Грантов нет: вызывает только триггер ниже, он SECURITY DEFINER (как
-- guard_content_author_active) — работает под любой пишущей ролью, в том
-- числе без USAGE на xtrud_private (ревью xtrud-security 2026-10-03).

CREATE FUNCTION xtrud_private.orders_normalize_place()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_place record;
  v_village_given boolean;
BEGIN
  -- Новый клиент передаёт село явно; старая сборка о нём не знает и
  -- на UPDATE не трогает колонку (NEW.village = OLD.village).
  IF TG_OP = 'INSERT' THEN
    v_village_given := NEW.village IS NOT NULL;
  ELSE
    v_village_given := NEW.village IS DISTINCT FROM OLD.village;
  END IF;

  -- Старая сборка сменила место (город, «вся РИ», другой район или
  -- legacy-id), а унаследованное село ему больше не соответствует — село
  -- очищается ДО нормализации (иначе нормализация вывела бы район из села и
  -- отменила бы выбор «вся Ингушетия»). Явно переданное новым клиентом
  -- неверное село не чинится, а отвергается ограничениями
  -- orders_village_needs_district / orders_village_in_district.
  IF NOT v_village_given AND NEW.village IS NOT NULL
     AND (NEW.city_id IS NOT NULL
          OR NEW.district IS NULL
          OR NOT EXISTS (SELECT 1 FROM public.district_villages dv
                          WHERE dv.district_name = NEW.district
                            AND dv.village_name = NEW.village)) THEN
    NEW.village := NULL;
  END IF;

  SELECT * INTO v_place FROM xtrud_private.place_normalize(NEW.city_id, NEW.district, NEW.village);
  NEW.city_id  := v_place.city_id;
  NEW.district := v_place.district;
  NEW.village  := v_place.village;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION xtrud_private.orders_normalize_place() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER orders_normalize_place
  BEFORE INSERT OR UPDATE OF city_id, district, village ON public.orders
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.orders_normalize_place();

-- Ограниченный автор не меняет и село: тот же список колонок + village.
DROP TRIGGER orders_author_active_guard ON public.orders;
CREATE TRIGGER orders_author_active_guard
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_author_active(
    'title', 'description', 'photo_urls', 'contact_name', 'l2_id', 'city_id', 'district', 'village');

-- ---------------------------------------------------------------------------
-- 5. Совпадение места: фильтр/зона F против места задания O.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.place_matches(
  f_city text, f_district text, f_village text,
  o_city text, o_district text, o_village text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_f record;
  v_o record;
  v_f_city text;
  v_o_city text;
  v_f_city_district text;
  v_o_city_district text;
BEGIN
  SELECT * INTO v_f FROM xtrud_private.place_normalize(f_city, f_district, f_village);
  SELECT * INTO v_o FROM xtrud_private.place_normalize(o_city, o_district, o_village);

  -- Назрань и Магас — одна плашка (DECISION 2026-05-24).
  v_f_city := CASE WHEN v_f.city_id IN ('nazran', 'magas') THEN 'nazran-magas' ELSE v_f.city_id END;
  v_o_city := CASE WHEN v_o.city_id IN ('nazran', 'magas') THEN 'nazran-magas' ELSE v_o.city_id END;

  -- Фильтр «вся Ингушетия» — всё.
  IF v_f_city IS NULL AND v_f.district IS NULL THEN
    RETURN true;
  END IF;
  -- Q3: задание «вся Ингушетия» фильтру/зоне с местом не совпадает (как было).
  IF v_o_city IS NULL AND v_o.district IS NULL THEN
    RETURN false;
  END IF;

  SELECT dc.district_name INTO v_f_city_district
    FROM public.district_cities dc WHERE dc.city_id = v_f_city LIMIT 1;
  SELECT dc.district_name INTO v_o_city_district
    FROM public.district_cities dc WHERE dc.city_id = v_o_city LIMIT 1;

  -- Фильтр «город C»: тот же город или «весь район» C (как было); сёла — нет.
  IF v_f_city IS NOT NULL THEN
    IF v_o_city IS NOT NULL THEN
      RETURN v_o_city = v_f_city;
    END IF;
    RETURN coalesce(v_o.village IS NULL AND v_o.district = v_f_city_district, false);
  END IF;

  -- Фильтр «весь район D»: его города, весь район и все его сёла.
  IF v_f.village IS NULL THEN
    IF v_o_city IS NOT NULL THEN
      RETURN coalesce(v_o_city_district = v_f.district, false);
    END IF;
    RETURN v_o.district = v_f.district;
  END IF;

  -- Фильтр «село V района D»: «весь район» D и само село; города — нет.
  IF v_o_city IS NOT NULL THEN
    RETURN false;
  END IF;
  RETURN v_o.district = v_f.district
     AND (v_o.village IS NULL OR v_o.village = v_f.village);
END;
$function$;

-- Зона специалиста (kind, location_id) против места.
CREATE FUNCTION xtrud_private.area_matches_place(
  p_area_kind text, p_area_location_id text,
  o_city text, o_district text, o_village text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_area_kind
    WHEN 'city' THEN coalesce(
      xtrud_private.place_matches(p_area_location_id, NULL, NULL, o_city, o_district, o_village), false)
    WHEN 'district' THEN coalesce(
      (SELECT xtrud_private.place_matches(NULL, d.name, NULL, o_city, o_district, o_village)
         FROM public.districts d WHERE d.id = p_area_location_id), false)
    ELSE false
  END;
$function$;

-- Вызываются только из SECURITY DEFINER-функций (владелец postgres).
REVOKE ALL ON FUNCTION xtrud_private.place_matches(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION xtrud_private.area_matches_place(text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Рассылка «Новая заявка» — живое тело 2026-10-03, изменено только
--    условие места (area_covers_place → area_matches_place + village).
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
                 -- 0212: район включает свои города и сёла; село — свой район и само село.
                 AND xtrud_private.area_matches_place(msa.kind::text, msa.location_id,
                                                      v_order.city_id, v_order.district, v_order.village)
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
-- Гранты не меняются (CREATE OR REPLACE их сохраняет): postgres, service_role.

-- ---------------------------------------------------------------------------
-- 7. Поиск специалистов — живое тело 2026-10-03; + p_district, p_village и
--    условие места через area_matches_place. Сигнатура меняется, поэтому
--    DROP + CREATE в одной транзакции (перегрузка рядом со старой сделала бы
--    вызов по именам неоднозначным). Старые сборки зовут по именам без новых
--    аргументов — DEFAULT NULL; при одном p_city_id результат тот же, кроме
--    канонизации legacy-id (Орджоникидзевская = Сунжа, Серноводская/
--    Нестеровская = сёла), пары Назрань/Магас и распознанной зоны
--    district:dzheirakhsky.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text);

CREATE FUNCTION public.search_masters(
  p_query text DEFAULT NULL::text, p_l2_id text DEFAULT NULL::text, p_city_id text DEFAULT NULL::text,
  p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0,
  p_l1_id text DEFAULT NULL::text, p_sort text DEFAULT 'rating'::text,
  p_district text DEFAULT NULL::text, p_village text DEFAULT NULL::text)
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

-- Гранты: anon, authenticated, service_role. PUBLIC (по умолчанию у новой
-- функции) снят: мост вызывает функцию только после SET ROLE anon|authenticated
-- (ревью xtrud-security 2026-10-03).
REVOKE ALL ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Зоны специалиста: старая сборка ещё показывает чип «Орджоникидзевская» —
--    сохраняем как Сунжу. Живое тело 2026-10-03 + нормализация и пропуск
--    дубля (чипы «Сунжа» и «Орджоникидзевская» вместе иначе нарушили бы
--    UNIQUE и уронили сохранение).
-- ---------------------------------------------------------------------------
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
      -- 0212 (Q1): Орджоникидзевская — прежнее имя Сунжи.
      IF v_city = 'ordzhonikidzevskaya' THEN
        v_city := 'sunzha';
      END IF;
      INSERT INTO public.master_service_areas (master_id, kind, location_id)
      VALUES (v_master_id, 'city', v_city)
      ON CONFLICT (master_id, kind, location_id) DO NOTHING;
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
-- Гранты сохраняются: postgres, authenticated, service_role.

-- ---------------------------------------------------------------------------
-- 9. Данные.
-- ---------------------------------------------------------------------------
-- Задания: триггер нормализации перекладывает legacy city_id. updated_at не
-- трогаем — это не правка автора (set_updated_at выключен только на время
-- этого UPDATE; ACCESS EXCLUSIVE на orders уже взят ALTER TABLE выше).
-- Под postgres auth.uid() = NULL → guard автора пропускает; guard статуса
-- пропускает не-authenticated; статус не меняется → AFTER-триггеры статуса
-- не срабатывают; trg_notify_order_accepted молчит (picked_master_id тот же).
ALTER TABLE public.orders DISABLE TRIGGER orders_set_updated_at;
UPDATE public.orders SET city_id = city_id
 WHERE city_id IN ('ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya');
ALTER TABLE public.orders ENABLE TRIGGER orders_set_updated_at;

-- Зоны: Орджоникидзевская = Сунжа. Дубль (если у специалиста уже есть Сунжа)
-- удаляется, остальное переименовывается. На 2026-10-03 дубля нет.
DELETE FROM public.master_service_areas a
 WHERE a.kind = 'city' AND a.location_id = 'ordzhonikidzevskaya'
   AND EXISTS (SELECT 1 FROM public.master_service_areas b
                WHERE b.master_id = a.master_id AND b.kind = 'city' AND b.location_id = 'sunzha');
UPDATE public.master_service_areas SET location_id = 'sunzha'
 WHERE kind = 'city' AND location_id = 'ordzhonikidzevskaya';
-- city:sernovodskaya|nesterovskaya (0 строк; может записать старая сборка)
-- не переписываются: place_normalize читает их как село.

-- users.city_id/district: 0 строк с местом — не трогаем.

-- ---------------------------------------------------------------------------
-- 10. Пост-проверки (миграция откатится целиком, если что-то не так).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders
              WHERE city_id IN ('ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya')) THEN
    RAISE EXCEPTION '0212_legacy_city_left_in_orders';
  END IF;
  IF EXISTS (SELECT 1 FROM public.master_service_areas
              WHERE kind = 'city' AND location_id = 'ordzhonikidzevskaya') THEN
    RAISE EXCEPTION '0212_ordzhonikidzevskaya_left_in_areas';
  END IF;
  IF (SELECT count(*) FROM public.orders WHERE village IS NOT NULL)
     <> (SELECT count(*) FROM xtrud_private.backup_0212_place
          WHERE tbl = 'orders' AND data->>'city_id' IN ('sernovodskaya', 'nesterovskaya')) THEN
    RAISE EXCEPTION '0212_village_count_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders o
               JOIN xtrud_private.backup_0212_place b ON b.tbl = 'orders' AND b.row_key = o.id::text
              WHERE o.updated_at IS DISTINCT FROM (b.data->>'updated_at')::timestamptz) THEN
    RAISE EXCEPTION '0212_updated_at_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.district_cities
              WHERE city_id IN ('ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya')) THEN
    RAISE EXCEPTION '0212_legacy_city_left_in_district_cities';
  END IF;
  IF (SELECT count(*) FROM public.cities
       WHERE id IN ('ordzhonikidzevskaya', 'sernovodskaya', 'nesterovskaya') AND is_active) <> 3 THEN
    RAISE EXCEPTION '0212_legacy_cities_must_stay_active';
  END IF;
  IF has_function_privilege('authenticated', 'xtrud_private.place_matches(text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'xtrud_private.area_matches_place(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'xtrud_private.place_normalize(text,text,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.district_villages', 'INSERT')
     OR has_table_privilege('authenticated', 'public.districts', 'UPDATE')
     OR has_table_privilege('authenticated', 'xtrud_private.backup_0212_place', 'SELECT')
     OR has_table_privilege('anon', 'xtrud_private.backup_0212_place', 'SELECT')
     OR has_function_privilege('authenticated', 'xtrud_private.place_normalize(text,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'xtrud_private.place_normalize(text,text,text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)', 'EXECUTE')
     OR has_table_privilege('service_role', 'public.district_villages', 'INSERT')
     OR has_table_privilege('service_role', 'public.districts', 'UPDATE') THEN
    RAISE EXCEPTION '0212_grants_too_wide';
  END IF;
  IF NOT has_function_privilege('anon', 'public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0212_search_masters_anon_lost';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE ((p.pronamespace = 'public'::regnamespace AND p.proname IN ('search_masters', 'set_master_service_areas', 'process_order_broadcast_queue'))
                  OR (p.pronamespace = 'xtrud_private'::regnamespace
                      AND p.proname IN ('place_normalize', 'place_matches', 'area_matches_place', 'orders_normalize_place')))
                AND pg_get_userbyid(p.proowner) <> 'postgres') THEN
    RAISE EXCEPTION '0212_function_owner_not_postgres';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
