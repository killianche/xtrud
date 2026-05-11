-- Migration 0005 — RPC complete_master_onboarding для атомарного завершения
-- master-онбординга (UPDATE users + INSERT master_profiles в одной транзакции).
--
-- Использование: supabase.rpc('complete_master_onboarding', {...})
-- SECURITY DEFINER чтобы RLS не блокировал UPDATE users.id != auth.uid()
-- (auth.uid() уже проверен внутри функции).

CREATE OR REPLACE FUNCTION public.complete_master_onboarding(
  p_first_name text,
  p_last_name text,
  p_city_id text,
  p_district text,
  p_bio text,
  p_experience_years int,
  p_has_tools bool,
  p_has_transport bool,
  p_service_radius_km int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- 1. Обновляем public.users
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

  -- 2. UPSERT в master_profiles (если уже есть draft — обновляем)
  INSERT INTO public.master_profiles (
    user_id, bio, experience_years, has_tools, has_transport,
    service_radius_km, status
  )
  VALUES (
    v_user_id,
    NULLIF(p_bio, ''),
    p_experience_years,
    p_has_tools,
    p_has_transport,
    p_service_radius_km,
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    bio = EXCLUDED.bio,
    experience_years = EXCLUDED.experience_years,
    has_tools = EXCLUDED.has_tools,
    has_transport = EXCLUDED.has_transport,
    service_radius_km = EXCLUDED.service_radius_km,
    status = 'pending';
END;
$$;

COMMENT ON FUNCTION public.complete_master_onboarding IS 'Атомарно завершает онбординг мастера: UPDATE users + UPSERT master_profiles. SECURITY DEFINER + проверка auth.uid() внутри.';

-- ============================================================================
-- GRANTS
-- ============================================================================
-- По умолчанию SECURITY DEFINER функции callable anyone — закрываем anon,
-- открываем только authenticated.
REVOKE EXECUTE ON FUNCTION public.complete_master_onboarding(
  text, text, text, text, text, int, bool, bool, int
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.complete_master_onboarding(
  text, text, text, text, text, int, bool, bool, int
) FROM anon;

GRANT EXECUTE ON FUNCTION public.complete_master_onboarding(
  text, text, text, text, text, int, bool, bool, int
) TO authenticated;
