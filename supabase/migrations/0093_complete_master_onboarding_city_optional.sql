-- 0093 — RPC complete_master_onboarding: city_id опционален.
-- Sprint 2026-05-15 убрал City-picker из onboarding-формы, но RPC всё ещё
-- требовал p_city_id text NOT NULL. Пустая строка падала FK violation на
-- users.city_id → cities.id. Кнопка «Завершить» в onboarding мастера не работала.
--
-- Fix: пустая строка → сохраняет существующее значение users.city_id (NULL
-- допустим для users.city_id, FK с ON DELETE RESTRICT срабатывает только
-- если value не NULL и не существует в cities).

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

  -- city_id: пустая строка → сохраняем существующее значение (COALESCE).
  -- Onboarding-форма больше не имеет city-picker (мастер задаёт зоны работы
  -- через master_service_areas в /profile/edit-master).
  UPDATE public.users
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    city_id = CASE WHEN NULLIF(p_city_id, '') IS NULL THEN city_id ELSE p_city_id END,
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
    has_transport = EXCLUDED.has_transport;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_master_onboarding(text,text,text,text,text,int,bool,bool) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_master_onboarding(text,text,text,text,text,int,bool,bool) TO authenticated;
