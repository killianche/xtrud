-- Migration 0004 — расширяем master_profiles полями для онбординг-визарда.
--
-- Источник полей: CATEGORIES_AND_PROFILES.md §2.1 A1/A2 (универсальные).
-- В sprint 3 добавляем поля для wizard. Pricing_mode и category-specific
-- attributes уехали в master_categories (sprint 4+).

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE public.tax_status AS ENUM (
  'individual',
  'self_employed',
  'individual_entrepreneur',
  'legal_entity'
);

CREATE TYPE public.home_clients_policy AS ENUM (
  'anytime',
  'with_male_present',
  'women_only'
);

-- ============================================================================
-- ALTER master_profiles
-- ============================================================================

ALTER TABLE public.master_profiles
  ADD COLUMN experience_years int CHECK (experience_years IS NULL
                                          OR (experience_years >= 0 AND experience_years <= 70)),
  ADD COLUMN has_tools bool NOT NULL DEFAULT false,
  ADD COLUMN has_transport bool NOT NULL DEFAULT false,
  ADD COLUMN service_radius_km int NOT NULL DEFAULT 10
    CHECK (service_radius_km >= 0 AND service_radius_km <= 200),
  ADD COLUMN work_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN languages text[] NOT NULL DEFAULT ARRAY['ru']::text[],
  ADD COLUMN tax_status public.tax_status,
  ADD COLUMN inn text CHECK (inn IS NULL OR length(inn) IN (10, 12)),
  ADD COLUMN team_size int NOT NULL DEFAULT 1
    CHECK (team_size >= 1 AND team_size <= 100),
  ADD COLUMN home_clients_policy public.home_clients_policy;

COMMENT ON COLUMN public.master_profiles.experience_years IS 'Опыт работы в годах (0-70). NULL = не указан.';
COMMENT ON COLUMN public.master_profiles.has_tools IS 'Бейдж "Со своим инструментом".';
COMMENT ON COLUMN public.master_profiles.has_transport IS 'Бейдж "На машине".';
COMMENT ON COLUMN public.master_profiles.service_radius_km IS 'Радиус выезда от точки в км (0-200). Default 10 — город.';
COMMENT ON COLUMN public.master_profiles.work_schedule IS 'JSONB {dayOfWeek: [startHour, endHour]} либо {} = по согласованию. См. §5.9 PROJECT_MAP.';
COMMENT ON COLUMN public.master_profiles.languages IS 'Языки общения: ru, ce, in, en, ar, tr (ISO codes). Default ["ru"].';
COMMENT ON COLUMN public.master_profiles.tax_status IS 'Налоговый статус мастера. NULL = не указан.';
COMMENT ON COLUMN public.master_profiles.inn IS 'ИНН (10 или 12 цифр). NULL допустим.';
COMMENT ON COLUMN public.master_profiles.team_size IS '1 = одиночка, 2-10 = бригада, 10+ = компания.';
COMMENT ON COLUMN public.master_profiles.home_clients_policy IS 'Политика выезда к клиентам-женщинам — для деликатных категорий. NULL = не применимо.';

-- ============================================================================
-- bio constraint — было text без длины. Ограничиваем до 500 символов (§2.1 A2).
-- ============================================================================

ALTER TABLE public.master_profiles
  ADD CONSTRAINT master_profiles_bio_max_length
  CHECK (bio IS NULL OR length(bio) <= 500);

-- ============================================================================
-- Index — мастеров по радиусу и инструменту (для будущих фильтров)
-- ============================================================================

CREATE INDEX master_profiles_active_radius_idx
  ON public.master_profiles (status, service_radius_km)
  WHERE status = 'active';
