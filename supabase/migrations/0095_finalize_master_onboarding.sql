-- 0095 — RPC finalize_master_onboarding.
--
-- Sprint 2026-05-20: reorder шагов master-онбординга по фидбэку user.
--
-- Старый порядок: role → categories → photo → profile (последним вызывался
-- complete_master_onboarding который атомарно сохранял first_name/last_name/bio
-- + ставил onboarding_completed_at).
--
-- Новый порядок: role → profile (имя/опыт/whatsapp) → categories → photo
-- (последний шаг). Фото логично идёт в конце — user не должен загружать
-- селфи до того как ввёл своё имя и опыт. Так делают Profi.ru, YouDo.
--
-- Архитектура data save:
--   profile-step → UPDATE users + UPSERT master_profiles напрямую с client
--                  (через RLS, без RPC). Никакого is_master=true, никакого
--                  onboarding_completed_at пока.
--   categories-step → set_master_categories RPC (как сейчас).
--   photo-step (last) → этот RPC: УСТАНАВЛИВАЕТ is_master=true, active_role=master,
--                       onboarding_completed_at=now(). AuthGate видит флаг
--                       и редиректит в /(tabs).
--
-- Если photo пропущен ("Пропустить") — RPC всё равно вызывается с тем же
-- эффектом. Фото опционально и не блокирует завершение онбординга.

CREATE OR REPLACE FUNCTION public.finalize_master_onboarding()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_profile boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Защита от race: master_profiles row должен существовать (был создан на
  -- profile-step через UPSERT). Если нет — клиент пропустил шаг или там
  -- silent fail. Возвращаем понятную ошибку для UI.
  SELECT EXISTS(
    SELECT 1 FROM public.master_profiles WHERE user_id = v_user_id
  ) INTO v_has_profile;

  IF NOT v_has_profile THEN
    RAISE EXCEPTION 'master_profile_missing' USING errcode = 'P0002',
      MESSAGE = 'Профиль мастера не создан. Вернитесь к шагу с именем и опытом.';
  END IF;

  -- Финализация: ставим is_master + active_role + onboarding_completed_at
  -- одним атомарным UPDATE. AuthGate увидит onboarding_completed_at != null
  -- и редиректнет на /(tabs). CHECK-constraint user_active_role_consistent
  -- (active_role='master' ⇒ is_master=true) гарантированно соблюдён.
  UPDATE public.users
  SET
    is_master = true,
    active_role = 'master',
    onboarding_completed_at = COALESCE(onboarding_completed_at, now())
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finalize_master_onboarding IS
'Финализация master-онбординга (последний шаг wizard). Устанавливает is_master=true, active_role=master, onboarding_completed_at=now(). Требует существующий master_profiles row (создаётся на profile-step через UPSERT с клиента).';

REVOKE EXECUTE ON FUNCTION public.finalize_master_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_master_onboarding() TO authenticated;
