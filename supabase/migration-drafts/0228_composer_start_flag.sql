-- 0228: флаг первого экрана создания задания (№242, 2026-10-05).
--
-- Владелец: новый путь «написал своими словами → нажал подсказку» — «но
-- главным образом, чтобы мы могли откатиться». Было: первый экран создания
-- задания — каталог разделов, переключателя нет. Стало:
--   app_settings.composer_start = {"variant": "quick" | "catalog"};
--   get_app_flags() отдаёт composer_start (нет строки или чужое значение →
--   'quick', новый путь); остальные ключи — как в 0217, старые сборки лишний
--   ключ игнорируют;
--   admin_set_composer_start(p_variant) — переключатель в веб-админке, по
--   образцу admin_set_require_login; действие в журнале — set_composer_start.
--
-- Откат: 0228_composer_start_flag_rollback.sql (get_app_flags и журнал — как
-- в 0225, строка настройки удаляется).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.
-- После применения: admin_set_composer_start — в server/src/rpc/routes.ts RPC_ALLOWLIST.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0228_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_set_composer_start(text)') IS NOT NULL THEN
    RAISE EXCEPTION '0228_already_applied';
  END IF;
  -- get_app_flags — ровно редакция 0217; журнал — ровно редакция 0225.
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM '35756efb5010c127ca5b47904a5382fc' THEN
    RAISE EXCEPTION '0228_get_app_flags_changed';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM 'fbde10a243ee3025b26e39a3724af276' THEN
    RAISE EXCEPTION '0228_admin_actions_action_check_changed';
  END IF;
  IF to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL THEN
    RAISE EXCEPTION '0228_dependencies_missing';
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
  'experience_badge_revoke', 'set_composer_start'
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
               WHERE s.key = 'composer_start' AND s.value->>'variant' IN ('quick', 'catalog')), 'quick')
  );
$function$;

REVOKE ALL ON FUNCTION public.get_app_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_flags() TO anon, authenticated, service_role;

CREATE FUNCTION public.admin_set_composer_start(p_variant text)
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
  IF p_variant IS NULL OR p_variant NOT IN ('quick', 'catalog') THEN
    RAISE EXCEPTION 'bad_variant' USING errcode = '22023';
  END IF;
  SELECT value->>'variant' INTO v_old FROM public.app_settings WHERE key = 'composer_start';
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('composer_start', jsonb_build_object('variant', p_variant), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  PERFORM public.admin_log_action(
    'set_composer_start', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    'Первый экран создания задания', NULL,
    jsonb_build_object('old', v_old, 'new', p_variant));
  RETURN public.get_app_flags();
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_composer_start(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_composer_start(text) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_set_composer_start(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_app_flags()', 'EXECUTE') THEN
    RAISE EXCEPTION '0228_grants_wrong';
  END IF;
  IF public.get_app_flags()->>'composer_start' IS DISTINCT FROM 'quick' THEN
    RAISE EXCEPTION '0228_default_wrong';
  END IF;
END $$;

COMMIT;
