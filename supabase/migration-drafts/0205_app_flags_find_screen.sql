-- 0205: переключатель вида экрана «Найти задание» (владелец, 2026-09-16:
-- «сделай дизайн с возможностью отката»).
--
-- app_settings.find_screen = {"variant": "category_first" | "classic"}.
-- category_first — новый экран: поиск и пилюли «Категория»/«Место», при входе
-- выбор раздела и три свежих задания; classic — прежняя лента с круглыми
-- кнопками. Приложение читает флаг при запуске (get_app_flags), админка меняет
-- (admin_set_find_screen) — откат без новой сборки.
-- Применено на Beget 2026-09-16.

BEGIN;

INSERT INTO public.app_settings (key, value)
VALUES ('find_screen', '{"variant": "category_first"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Флаги интерфейса для приложения: только безопасные для всех ключи.
CREATE OR REPLACE FUNCTION public.get_app_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'find_screen',
    coalesce((SELECT value->>'variant' FROM public.app_settings WHERE key = 'find_screen'), 'category_first')
  );
$$;

ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn','suspend','unsuspend','ban','unban','hide','unhide','hide_order','dismiss_report',
  'resolve_report','issue_signed_url','verification_approve','verification_reject',
  'master_show','master_hide','set_password','set_phone','set_order_limits','set_find_screen']));

CREATE OR REPLACE FUNCTION public.admin_set_find_screen(p_variant text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_variant IS NULL OR p_variant NOT IN ('category_first', 'classic') THEN
    RAISE EXCEPTION 'Неизвестный вид экрана.' USING ERRCODE = '22023', DETAIL = 'bad_variant';
  END IF;
  SELECT value->>'variant' INTO v_old FROM public.app_settings WHERE key = 'find_screen';
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('find_screen', jsonb_build_object('variant', p_variant), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  PERFORM public.admin_log_action(
    'set_find_screen', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    'Вид экрана «Найти задание»', NULL,
    jsonb_build_object('old', v_old, 'new', p_variant));
  RETURN public.get_app_flags();
END;
$$;

REVOKE ALL ON FUNCTION public.get_app_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_flags() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_find_screen(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_find_screen(text) TO authenticated, service_role;

COMMIT;
