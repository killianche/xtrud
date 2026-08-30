-- Migration 0003 — добавляем поля для onboarding-флоу и активной роли.
--
-- 1. users.onboarding_completed_at — timestamptz NULL.
--    Используется AuthGate для редиректа на /(onboarding)/role при NULL.
-- 2. user_active_role enum (client|master) + users.active_role.
--    Какую "сторону" приложения видит dual-role пользователь сейчас.
--    Меняется свитчером в UI. Только для is_master=true можно поставить 'master'.

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE public.user_active_role AS ENUM ('client', 'master');

-- ============================================================================
-- ALTER users
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN onboarding_completed_at timestamptz NULL,
  ADD COLUMN active_role public.user_active_role NOT NULL DEFAULT 'client';

COMMENT ON COLUMN public.users.onboarding_completed_at IS 'NULL = пользователь ещё не выбрал роль (показываем /(onboarding)/role). После выбора — timestamp.';
COMMENT ON COLUMN public.users.active_role IS 'Текущая активная роль пользователя в UI (свитчер). Только is_master=true может быть active_role=master.';

-- ============================================================================
-- CONSTRAINT — active_role=master только если is_master=true
-- ============================================================================

ALTER TABLE public.users
  ADD CONSTRAINT users_active_role_requires_master_flag
  CHECK (active_role = 'client' OR is_master = true);

-- ============================================================================
-- INDEX — для быстрого поиска "ещё не онбордились"
-- ============================================================================

CREATE INDEX users_onboarding_pending_idx
  ON public.users (onboarding_completed_at)
  WHERE onboarding_completed_at IS NULL;
