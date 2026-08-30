-- Migration 0007 — master_categories link-table (many-to-many master ↔ L2).
--
-- Источник: CATEGORIES_AND_PROFILES.md §4 (мультикатегорийный мастер, до 5 L2)
-- и §8.2 (схема таблицы).
--
-- Sprint 4 минимум: id, master_id, l2_id, l3_ids, pricing_mode, basic defaults.
-- Поля для sprint 5+: pricing jsonb, attributes jsonb, category-specific rating.

-- ============================================================================
-- ENUM
-- ============================================================================

CREATE TYPE public.master_pricing_mode AS ENUM (
  'per_hour',
  'per_unit',
  'negotiable',
  'on_quote'
);

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE public.master_categories (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id            uuid NOT NULL REFERENCES public.master_profiles(user_id) ON DELETE CASCADE,
  l2_id                text NOT NULL REFERENCES public.categories_l2(id) ON DELETE RESTRICT,
  l3_ids               text[] NOT NULL DEFAULT ARRAY[]::text[],
  pricing_mode         public.master_pricing_mode NOT NULL DEFAULT 'negotiable',
  pricing              jsonb NOT NULL DEFAULT '{}'::jsonb,
  attributes           jsonb NOT NULL DEFAULT '{}'::jsonb,
  category_bio         text CHECK (category_bio IS NULL OR length(category_bio) <= 200),
  category_radius_km   int CHECK (category_radius_km IS NULL
                                  OR (category_radius_km >= 0 AND category_radius_km <= 200)),
  rating_avg           numeric(2,1) CHECK (rating_avg IS NULL
                                           OR (rating_avg >= 1.0 AND rating_avg <= 5.0)),
  rating_count         int NOT NULL DEFAULT 0,
  closed_deals         int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(master_id, l2_id)
);

COMMENT ON TABLE public.master_categories IS 'Many-to-many master ↔ L2 категория. До 5 L2 на мастера (trigger). l3_ids — какие L3 внутри L2 мастер делает.';
COMMENT ON COLUMN public.master_categories.l3_ids IS 'Массив slug-ов L3 услуг внутри l2_id. Пустой массив = все услуги в категории.';
COMMENT ON COLUMN public.master_categories.pricing_mode IS 'per_hour / per_unit / negotiable / on_quote (после осмотра).';
COMMENT ON COLUMN public.master_categories.pricing IS 'JSONB ценообразование по L3: {l3_id: {min, max, unit}}. Подробнее CATEGORIES_AND_PROFILES §8.2.';
COMMENT ON COLUMN public.master_categories.attributes IS 'JSONB category-specific атрибуты (§2.2). GIN-индекс для фильтров.';
COMMENT ON COLUMN public.master_categories.category_radius_km IS 'Override service_radius_km из master_profiles. NULL = берём из master_profiles.';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX master_categories_master_id_idx ON public.master_categories (master_id);
CREATE INDEX master_categories_l2_id_idx ON public.master_categories (l2_id);
CREATE INDEX master_categories_l2_rating_idx
  ON public.master_categories (l2_id, rating_avg DESC NULLS LAST);
CREATE INDEX master_categories_attributes_gin_idx
  ON public.master_categories USING GIN (attributes);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- updated_at автообновление (используем существующую set_updated_at)
CREATE TRIGGER master_categories_set_updated_at
BEFORE UPDATE ON public.master_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Trigger: max 5 категорий на мастера. CATEGORIES_AND_PROFILES.md §4.1.
CREATE OR REPLACE FUNCTION public.check_master_categories_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.master_categories
  WHERE master_id = NEW.master_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'max_5_categories_per_master' USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_master_categories_limit IS 'Trigger function: ограничивает мастера 5 L2-категориями (CATEGORIES_AND_PROFILES §4.1).';

-- Запрещаем RPC-доступ — функция только для триггера
REVOKE EXECUTE ON FUNCTION public.check_master_categories_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_master_categories_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_master_categories_limit() FROM authenticated;

CREATE TRIGGER master_categories_max_5_per_master
BEFORE INSERT ON public.master_categories
FOR EACH ROW
EXECUTE FUNCTION public.check_master_categories_limit();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.master_categories ENABLE ROW LEVEL SECURITY;

-- Read public — клиенты должны видеть какие категории у мастеров
CREATE POLICY master_categories_read_all ON public.master_categories
  FOR SELECT USING (true);

-- Owner-only writes
CREATE POLICY master_categories_insert_own ON public.master_categories
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);

CREATE POLICY master_categories_update_own ON public.master_categories
  FOR UPDATE USING ((SELECT auth.uid()) = master_id)
  WITH CHECK ((SELECT auth.uid()) = master_id);

CREATE POLICY master_categories_delete_own ON public.master_categories
  FOR DELETE USING ((SELECT auth.uid()) = master_id);
