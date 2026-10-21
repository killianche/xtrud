-- 0253: флаг отката новой главной приложения (2026-10-21).
--
-- Новая главная (рекомендации и анимации) выходит в новой версии
-- приложения; флаг нужен, чтобы вернуть прежнюю главную без новой сборки.
-- По образцу 0229 (composer_form). Было: get_app_flags() отдаёт find_screen,
-- find_tiles, require_login, composer_start, composer_form. Стало:
--   app_settings.home_variant = {"variant": "v2" | "classic"};
--   get_app_flags() дополнительно отдаёт home_variant (нет строки или чужое
--   значение → 'v2' — новая главная); остальные ключи — ровно как в живой
--   редакции (0229), старые сборки лишний ключ игнорируют;
--   admin_set_home_variant(p_variant) — переключатель в веб-админке, по
--   образцу admin_set_composer_form; действие в журнале — set_home_variant;
--   admin_actions_action_check — живой список (после 0246) + set_home_variant.
--
-- Откат: 0253_home_variant_flag_rollback.sql (get_app_flags — ровно живая
-- редакция до 0253, переключатель и строка настройки удаляются; журнал
-- неизменяем — см. откат).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.
-- После применения: admin_set_home_variant — в server/src/rpc/routes.ts RPC_ALLOWLIST
-- (выкладка xtrud-api), затем веб-админка.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0253_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_set_home_variant(text)') IS NOT NULL THEN
    RAISE EXCEPTION '0253_already_applied';
  END IF;
  -- get_app_flags — ровно редакция 0229; ограничение журнала — ровно после 0246.
  -- md5 — живые редакции, прочитаны с базы 2026-10-21 (read-only) перед
  -- подготовкой черновика.
  -- Ограничение журнала допускается и в редакции самой 0253 (05aab904…):
  -- откат 0253 его не возвращает (журнал неизменяем), и повторное применение
  -- после отката иначе упало бы на этой проверке.
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM 'e79f34ba6911ccfa8652b545fb4860f2' THEN
    RAISE EXCEPTION '0253_get_app_flags_changed';
  END IF;
  IF coalesce((SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check'), '')
     NOT IN ('57c6b2cece846b2c3c79505ccd03f878', '05aab9045f32341e01acaa7824c2ae8b') THEN
    RAISE EXCEPTION '0253_admin_actions_action_check_changed';
  END IF;
  IF to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL THEN
    RAISE EXCEPTION '0253_dependencies_missing';
  END IF;
END $$;

ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order',
  'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve',
  'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone',
  'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update',
  'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show',
  'category_hide', 'set_find_tiles', 'broadcast_push', 'category_open_responses',
  'set_require_login', 'instagram_approve', 'instagram_reject', 'experience_badge_grant',
  'experience_badge_revoke', 'set_composer_start', 'set_composer_form',
  'order_set_category', 'category_create', 'order_shadow_hide', 'order_shadow_unhide',
  'category_update', 'category_merge', 'section_rename', 'catalog_reorder',
  'staff_role_set', 'order_test_mark', 'company_approve', 'company_reject',
  'company_revoke', 'experience_badge_reject', 'set_home_variant'
]::text[]));

CREATE OR REPLACE FUNCTION public.get_app_flags()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'find_screen',
    coalesce((SELECT value->>'variant' FROM public.app_settings WHERE key = 'find_screen'), 'category_first'),
    'find_tiles',
    coalesce((SELECT s.value->>'variant' FROM public.app_settings s
               WHERE s.key = 'find_tiles' AND s.value->>'variant' IN ('mosaic', 'grid')), 'grid'),
    'require_login',
    coalesce((SELECT (s.value->>'enabled')::boolean FROM public.app_settings s
               WHERE s.key = 'require_login' AND s.value->>'enabled' IN ('true', 'false')), false),
    'composer_start',
    coalesce((SELECT s.value->>'variant' FROM public.app_settings s
               WHERE s.key = 'composer_start' AND s.value->>'variant' IN ('quick', 'catalog')), 'quick'),
    'composer_form',
    coalesce((SELECT s.value->>'variant' FROM public.app_settings s
               WHERE s.key = 'composer_form' AND s.value->>'variant' IN ('single', 'steps')), 'single'),
    'home_variant',
    coalesce((SELECT s.value->>'variant' FROM public.app_settings s
               WHERE s.key = 'home_variant' AND s.value->>'variant' IN ('v2', 'classic')), 'v2')
  );
$function$;

REVOKE ALL ON FUNCTION public.get_app_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_flags() TO anon, authenticated, service_role;

CREATE FUNCTION public.admin_set_home_variant(p_variant text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_variant IS NULL OR p_variant NOT IN ('v2', 'classic') THEN
    RAISE EXCEPTION 'bad_variant' USING errcode = '22023';
  END IF;
  SELECT value->>'variant' INTO v_old FROM public.app_settings WHERE key = 'home_variant';
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('home_variant', jsonb_build_object('variant', p_variant), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  PERFORM public.admin_log_action(
    'set_home_variant', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    'Главная: новая / прежняя', NULL,
    jsonb_build_object('old', v_old, 'new', p_variant));
  RETURN public.get_app_flags();
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_home_variant(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_home_variant(text) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_set_home_variant(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_app_flags()', 'EXECUTE') THEN
    RAISE EXCEPTION '0253_grants_wrong';
  END IF;
  IF public.get_app_flags()->>'home_variant' IS DISTINCT FROM 'v2' THEN
    RAISE EXCEPTION '0253_default_wrong';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM '05aab9045f32341e01acaa7824c2ae8b' THEN
    RAISE EXCEPTION '0253_admin_actions_action_check_wrong';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
