-- Migration 0067 — полностью удаляем «радиус выезда».
--
-- Решение (фидбек user 2026-05-15): радиус как числовое поле километров не
-- нужен. Замена — таблица `master_service_areas` (m2m мастер ↔ город/район),
-- введённая в миграции 0064. Это даёт мастеру явный список «где работаю»
-- (Назрань, Магас, Сунжа), а не абстрактный «N км вокруг точки».
--
-- На UI редактирования мастер-профиля поле уже было скрыто (см.
-- MasterProfileFormBody.tsx). Эта миграция чистит схему БД и RPC — после
-- неё в коде не останется ни одного `service_radius_km` / `category_radius_km`.
--
-- Что делает:
-- 1. DROP COLUMN service_radius_km из master_profiles (+ удаляет связанный
--    индекс master_profiles_active_radius_idx и CHECK constraint).
-- 2. DROP COLUMN category_radius_km из master_categories (override per-категория).
-- 3. CREATE OR REPLACE complete_master_onboarding RPC без параметра
--    p_service_radius_km и без вставки service_radius_km. GRANTS перевыданы.
-- 4. DROP старая сигнатура RPC (с 9-м параметром) — в Postgres перегрузка
--    функций по сигнатуре, без явного DROP старая останется висеть.
--
-- Безопасность: dev/demo окружение, потерь продуктовых данных нет.

BEGIN;

-- 1. master_profiles.service_radius_km
DROP INDEX IF EXISTS public.master_profiles_active_radius_idx;
ALTER TABLE public.master_profiles DROP COLUMN IF EXISTS service_radius_km;

-- 2. master_categories.category_radius_km
ALTER TABLE public.master_categories DROP COLUMN IF EXISTS category_radius_km;

-- 3. RPC complete_master_onboarding — пересоздаём без service_radius_km.
--    Сначала дропаем СТАРУЮ сигнатуру (9 параметров), иначе она останется.
DROP FUNCTION IF EXISTS public.complete_master_onboarding(
  text, text, text, text, text, int, bool, bool, int
);

CREATE OR REPLACE FUNCTION public.complete_master_onboarding(
  p_first_name text,
  p_last_name text,
  p_city_id text,
  p_district text,
  p_bio text,
  p_experience_years int,
  p_has_tools bool,
  p_has_transport bool
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  UPDATE public.users
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    city_id = p_city_id,
    district = NULLIF(p_district, ''),
    is_master = true,
    active_role = 'master',
    onboarding_completed_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.master_profiles (
    user_id, bio, experience_years, has_tools, has_transport, status
  )
  VALUES (
    v_user_id,
    NULLIF(p_bio, ''),
    p_experience_years,
    p_has_tools,
    p_has_transport,
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    bio = EXCLUDED.bio,
    experience_years = EXCLUDED.experience_years,
    has_tools = EXCLUDED.has_tools,
    has_transport = EXCLUDED.has_transport,
    status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_master_onboarding(
  text, text, text, text, text, int, bool, bool
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.complete_master_onboarding(
  text, text, text, text, text, int, bool, bool
) FROM anon;

GRANT EXECUTE ON FUNCTION public.complete_master_onboarding(
  text, text, text, text, text, int, bool, bool
) TO authenticated;

COMMIT;
