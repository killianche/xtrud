-- Migration 0001_init — базовая схема xtrud.
--
-- Источник: CATEGORIES_AND_PROFILES.md §8.2 (таблицы), §8.3 (индексы), §8.4 (RLS).
-- Покрывает sprint 1: cities, users, master_profiles, categories_l1/l2/l3.
-- Расширения (master_categories, orders, photos, reviews и т.д.) — в следующих миграциях.

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE public.user_gender AS ENUM ('male', 'female', 'unspecified');
CREATE TYPE public.user_status AS ENUM ('active', 'suspended', 'banned', 'deleted');
CREATE TYPE public.master_status AS ENUM ('draft', 'pending', 'active', 'suspended', 'archived');
CREATE TYPE public.category_urgency AS ENUM ('urgent', 'week', 'month');
CREATE TYPE public.category_seasonality AS ENUM ('year_round', 'summer', 'winter', 'wedding_season');

-- ============================================================================
-- UTIL: updated_at тригер
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at IS 'Триггерная функция: проставляет updated_at = now() при UPDATE.';

-- ============================================================================
-- TABLE: cities (справочник городов и районов)
-- ============================================================================

CREATE TABLE public.cities (
  id          text PRIMARY KEY,                          -- slug, e.g. 'magas'
  name        text NOT NULL,
  region      text NOT NULL DEFAULT 'Ingushetia',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cities IS 'Города и районы. Стартовый набор — 5 городов Ингушетии.';

INSERT INTO public.cities (id, name, sort_order) VALUES
  ('magas',     'Магас',     1),
  ('nazran',    'Назрань',   2),
  ('sunzha',    'Сунжа',     3),
  ('malgobek',  'Малгобек',  4),
  ('karabulak', 'Карабулак', 5);

-- ============================================================================
-- TABLE: users (расширение auth.users, 1:1 по id)
-- ============================================================================

CREATE TABLE public.users (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Публичные поля (см. users_public view ниже)
  first_name              text,
  last_name               text,
  avatar_url              text,
  city_id                 text REFERENCES public.cities(id),
  district                text,
  is_client               boolean NOT NULL DEFAULT true,
  is_master               boolean NOT NULL DEFAULT false,
  rating_as_client_avg    numeric(2,1)
                          CHECK (rating_as_client_avg IS NULL
                                 OR (rating_as_client_avg >= 1.0 AND rating_as_client_avg <= 5.0)),
  rating_as_client_count  int NOT NULL DEFAULT 0,
  status                  public.user_status NOT NULL DEFAULT 'active',

  -- Приватные поля (доступны только владельцу через RLS)
  phone                   text UNIQUE,         -- может быть NULL для анонимных
  birth_year              int CHECK (birth_year IS NULL
                                     OR (birth_year >= 1920
                                         AND birth_year <= EXTRACT(YEAR FROM now())::int)),
  gender                  public.user_gender NOT NULL DEFAULT 'unspecified',
  last_active_at          timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.users IS 'Расширение auth.users 1:1 по id. Приватные поля (phone, birth_year, gender, last_active_at) защищены RLS — видны только владельцу.';
COMMENT ON COLUMN public.users.phone IS 'Может быть NULL для анонимных сессий sprint 1. Sprint 2 заполнит после OTP.';

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- TRIGGER: auto-create public.users on auth.users insert
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user IS 'Создаёт public.users при появлении auth.users (signup/anonymous).';

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- VIEW: users_public (публичный срез без phone и других приватных полей)
-- ============================================================================

-- security_invoker = false — view выполняется с правами владельца (postgres),
-- что позволяет читать users поверх RLS, но отдаёт только безопасные колонки.
-- Это сознательное решение для предоставления публичных профилей.

CREATE VIEW public.users_public
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  id,
  first_name,
  last_name,
  avatar_url,
  city_id,
  district,
  is_master,
  rating_as_client_avg,
  rating_as_client_count,
  created_at
FROM public.users
WHERE status = 'active';

COMMENT ON VIEW public.users_public IS 'Публичный срез users — без phone, birth_year, gender, last_active_at. security_invoker=false: выполняется с правами owner для отдачи публичных колонок (RLS на users всё равно блокирует прямой SELECT с anon role).';

GRANT SELECT ON public.users_public TO anon, authenticated;

-- ============================================================================
-- TABLE: master_profiles (профиль мастера, активируется когда is_master=true)
-- ============================================================================

CREATE TABLE public.master_profiles (
  user_id              uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  bio                  text,
  status               public.master_status NOT NULL DEFAULT 'draft',
  verification_level   int NOT NULL DEFAULT 1
                       CHECK (verification_level >= 1 AND verification_level <= 5),
  closed_deals         int NOT NULL DEFAULT 0,
  rating_overall_avg   numeric(2,1)
                       CHECK (rating_overall_avg IS NULL
                              OR (rating_overall_avg >= 1.0 AND rating_overall_avg <= 5.0)),
  rating_overall_count int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.master_profiles IS 'Профиль мастера (CATEGORIES_AND_PROFILES §2.1). Stub — расширяется в sprint 2: experience_years, has_tools, has_transport, tax_status, inn, team_size, service_radius_km, work_schedule, languages, home_clients_policy, intro_video_url.';

CREATE TRIGGER master_profiles_set_updated_at
BEFORE UPDATE ON public.master_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- TABLE: categories_l1 (10 крупных сфер)
-- ============================================================================

CREATE TABLE public.categories_l1 (
  id              text PRIMARY KEY,              -- slug, e.g. 'construction'
  name_ru         text NOT NULL,
  icon            text NOT NULL,                 -- lucide icon name
  cover_image_url text,
  sort_order      int NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.categories_l1 IS 'Уровень 1: 10 крупных сфер жизни (CATEGORIES_AND_PROFILES §1.2). Seed — в supabase/seed/categories.sql.';

-- ============================================================================
-- TABLE: categories_l2 (64 категории)
-- ============================================================================

CREATE TABLE public.categories_l2 (
  id          text PRIMARY KEY,                  -- slug, e.g. 'electrical'
  l1_id       text NOT NULL REFERENCES public.categories_l1(id) ON DELETE RESTRICT,
  name_ru     text NOT NULL,
  icon        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  is_visible  boolean NOT NULL DEFAULT false,    -- "показывать на стартовой витрине MVP"
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.categories_l2 IS 'Уровень 2: 64 категории (CATEGORIES_AND_PROFILES §1.2). is_visible — флаг MVP-витрины (~23 главных в sprint 1).';
COMMENT ON COLUMN public.categories_l2.is_active IS 'Категория существует в системе (можно создать запись).';
COMMENT ON COLUMN public.categories_l2.is_visible IS 'Показывать в дефолтном каталоге на стартовой витрине.';

-- ============================================================================
-- TABLE: categories_l3 (~290 услуг)
-- ============================================================================

CREATE TABLE public.categories_l3 (
  id               text PRIMARY KEY,             -- slug, e.g. 'replace-outlet'
  l2_id            text NOT NULL REFERENCES public.categories_l2(id) ON DELETE RESTRICT,
  name_ru          text NOT NULL,
  icon             text,                         -- optional, defaults to L2 icon
  avg_check_rub    int CHECK (avg_check_rub IS NULL OR avg_check_rub >= 0),
  urgency_typical  public.category_urgency NOT NULL DEFAULT 'week',
  seasonality      public.category_seasonality NOT NULL DEFAULT 'year_round',
  requires_license boolean NOT NULL DEFAULT false,
  sort_order       int NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.categories_l3 IS 'Уровень 3: ~290 конкретных услуг (CATEGORIES_AND_PROFILES §1.2). avg_check_rub — медиана цены, urgency — типичный срок.';

-- ============================================================================
-- INDEXES (CATEGORIES_AND_PROFILES §8.3 — критичные для sprint 1)
-- ============================================================================

CREATE INDEX users_phone_idx       ON public.users (phone) WHERE phone IS NOT NULL;
CREATE INDEX users_city_id_idx     ON public.users (city_id) WHERE city_id IS NOT NULL;
CREATE INDEX users_is_master_idx   ON public.users (is_master) WHERE is_master = true;

CREATE INDEX master_profiles_status_idx ON public.master_profiles (status);

CREATE INDEX categories_l2_l1_id_idx     ON public.categories_l2 (l1_id);
CREATE INDEX categories_l2_is_visible_idx ON public.categories_l2 (is_visible) WHERE is_visible = true;
CREATE INDEX categories_l3_l2_id_idx     ON public.categories_l3 (l2_id);

-- ============================================================================
-- RLS — Row Level Security
-- ============================================================================

ALTER TABLE public.cities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories_l1   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories_l2   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories_l3   ENABLE ROW LEVEL SECURITY;

-- cities: публично читать активные
CREATE POLICY cities_read_active ON public.cities
  FOR SELECT
  USING (is_active = true);

-- categories: публично читать активные
CREATE POLICY categories_l1_read_active ON public.categories_l1
  FOR SELECT
  USING (is_active = true);

CREATE POLICY categories_l2_read_active ON public.categories_l2
  FOR SELECT
  USING (is_active = true);

CREATE POLICY categories_l3_read_active ON public.categories_l3
  FOR SELECT
  USING (is_active = true);

-- users:
-- SELECT — только свою запись (приватные поля защищены).
-- Публичный срез других пользователей — через VIEW users_public.
-- INSERT/UPDATE — только свою запись (обычно INSERT не нужен —
-- триггер handle_new_auth_user делает это сам).

CREATE POLICY users_select_own ON public.users
  FOR SELECT
  USING ((SELECT auth.uid()) = id);

CREATE POLICY users_insert_own ON public.users
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY users_update_own ON public.users
  FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- master_profiles:
-- SELECT — публично (всех мастеров видно).
-- INSERT/UPDATE — только владелец.

CREATE POLICY master_profiles_read_all ON public.master_profiles
  FOR SELECT
  USING (true);

CREATE POLICY master_profiles_insert_own ON public.master_profiles
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY master_profiles_update_own ON public.master_profiles
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
