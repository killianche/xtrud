-- Migration 0064 — master_service_areas: где мастер работает (P1-3 упрощённая).
--
-- Контекст: research/MASTER_ACCOUNT_PLAN.md §P1-3. По решению пользователя
-- 2026-05-15 — упрощённый scope: только города и районы (Малгобекский,
-- Назрановский, Сунженский, Джейрахский). БЕЗ сёл и БЕЗ radius — мастер
-- просто отмечает галочками где работает.
--
-- Раньше у мастера было одно поле master_profiles.city_id (через users) +
-- service_radius_km. Теперь — m2m с локациями: мастер может работать
-- одновременно в 2 городах или городе + районе.
--
-- Структура: kind enum('city'|'district'), location_id text:
--   - kind='city' → location_id ∈ cities.id (магас, назрань, ...)
--   - kind='district' → location_id ∈ slug ('nazranovsky' / 'sunzhensky' / ...)
--
-- Districts хранятся как enum-like text — таблицы districts в БД нет,
-- источник истины src/lib/location-config.ts (DISTRICTS const).

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TYPE public.master_area_kind AS ENUM ('city', 'district');

CREATE TABLE public.master_service_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id     uuid NOT NULL REFERENCES public.master_profiles(user_id) ON DELETE CASCADE,
  kind          public.master_area_kind NOT NULL,
  location_id   text NOT NULL CHECK (length(location_id) BETWEEN 1 AND 50),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Один мастер не может дважды добавить одну и ту же локацию.
  UNIQUE (master_id, kind, location_id)
);

COMMENT ON TABLE public.master_service_areas IS
  'P1-3 (упрощ.): где работает мастер. Multi-select cities + districts. Без сёл/radius. Источник истины для районов — src/lib/location-config.ts DISTRICTS.';
COMMENT ON COLUMN public.master_service_areas.kind IS
  'city = location_id это cities.id; district = slug района из DISTRICTS (nazranovsky/sunzhensky/malgobeksky/dzheirakhsky).';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX master_service_areas_master_id_idx ON public.master_service_areas (master_id);
CREATE INDEX master_service_areas_location_idx
  ON public.master_service_areas (kind, location_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.master_service_areas ENABLE ROW LEVEL SECURITY;

-- Public read — клиенты должны видеть где работает мастер.
CREATE POLICY master_service_areas_read_all ON public.master_service_areas
  FOR SELECT USING (true);

-- Owner-only writes.
CREATE POLICY master_service_areas_insert_own ON public.master_service_areas
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);

CREATE POLICY master_service_areas_delete_own ON public.master_service_areas
  FOR DELETE USING ((SELECT auth.uid()) = master_id);

-- UPDATE не нужен — для замены значения делаем DELETE + INSERT (атомарно
-- через RPC ниже).

-- ============================================================================
-- RPC: атомарно заменить весь набор service-areas мастера
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_master_service_areas(
  p_cities text[],
  p_districts text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_master_id uuid;
  v_city text;
  v_district text;
BEGIN
  v_master_id := auth.uid();
  IF v_master_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = 'P0001';
  END IF;

  -- Удаляем все старые areas мастера
  DELETE FROM public.master_service_areas WHERE master_id = v_master_id;

  -- Вставляем новые cities
  IF p_cities IS NOT NULL THEN
    FOREACH v_city IN ARRAY p_cities LOOP
      INSERT INTO public.master_service_areas (master_id, kind, location_id)
      VALUES (v_master_id, 'city', v_city);
    END LOOP;
  END IF;

  -- Вставляем новые districts
  IF p_districts IS NOT NULL THEN
    FOREACH v_district IN ARRAY p_districts LOOP
      INSERT INTO public.master_service_areas (master_id, kind, location_id)
      VALUES (v_master_id, 'district', v_district);
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_master_service_areas(text[], text[]) TO authenticated;
