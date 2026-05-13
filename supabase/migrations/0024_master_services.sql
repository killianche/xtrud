-- Migration 0024 — master_services: плоский прайс-лист услуг мастера.
--
-- Sprint 31.5: услуги мастера — отдельная таблица (не L3-категория), плоский список
-- "название услуги — диапазон цены — единица" (паттерн Profi.ru / Авито Услуги).
-- Используется в master/[id].tsx (публичный showcase) и edit-master.tsx (CRUD).

-- ============================================================================
-- ENUM unit
-- ============================================================================

CREATE TYPE public.service_unit AS ENUM (
  'per_hour',  -- за час
  'per_task',  -- за работу (фиксированная сумма)
  'per_m2',    -- за м²
  'per_day'    -- за день
);

COMMENT ON TYPE public.service_unit IS 'Единица измерения цены услуги мастера (Sprint 31.5).';

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE public.master_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id   uuid NOT NULL REFERENCES public.master_profiles(user_id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(title) BETWEEN 2 AND 100),
  price_min   int NOT NULL CHECK (price_min >= 0),
  price_max   int CHECK (price_max IS NULL OR price_max >= price_min),
  unit        public.service_unit NOT NULL DEFAULT 'per_task',
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.master_services IS
  'Плоский прайс-лист мастера: title + диапазон + unit. До 20 услуг на мастера (trigger). Sprint 31.5.';
COMMENT ON COLUMN public.master_services.title IS
  'Свободный текст до 100 символов, например "Установка смесителя".';
COMMENT ON COLUMN public.master_services.price_min IS
  'Минимальная цена в рублях (integer, без копеек).';
COMMENT ON COLUMN public.master_services.price_max IS
  'Верхняя граница диапазона. NULL = цена "от X".';
COMMENT ON COLUMN public.master_services.position IS
  'Порядок в списке (для drag-reorder в будущем). По умолчанию 0 — сортировка по created_at.';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX master_services_master_id_idx ON public.master_services (master_id, position, created_at);

-- ============================================================================
-- updated_at trigger (используем существующую set_updated_at из 0001)
-- ============================================================================

CREATE TRIGGER master_services_set_updated_at
BEFORE UPDATE ON public.master_services
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Trigger: max 20 услуг на мастера
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_master_services_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.master_services
  WHERE master_id = NEW.master_id;

  IF v_count >= 20 THEN
    RAISE EXCEPTION 'max_20_services_per_master' USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_master_services_limit IS
  'Trigger function: ограничивает мастера 20 услугами в прайсе (Sprint 31.5).';

REVOKE EXECUTE ON FUNCTION public.check_master_services_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_master_services_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_master_services_limit() FROM authenticated;

CREATE TRIGGER master_services_max_20_per_master
BEFORE INSERT ON public.master_services
FOR EACH ROW
EXECUTE FUNCTION public.check_master_services_limit();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.master_services ENABLE ROW LEVEL SECURITY;

-- Public read — клиенты видят прайс на карточке мастера.
CREATE POLICY master_services_read_all ON public.master_services
  FOR SELECT USING (true);

-- Owner-only writes.
CREATE POLICY master_services_insert_own ON public.master_services
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);

CREATE POLICY master_services_update_own ON public.master_services
  FOR UPDATE USING ((SELECT auth.uid()) = master_id)
  WITH CHECK ((SELECT auth.uid()) = master_id);

CREATE POLICY master_services_delete_own ON public.master_services
  FOR DELETE USING ((SELECT auth.uid()) = master_id);
