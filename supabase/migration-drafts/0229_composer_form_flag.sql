-- 0229: флаг формы шагов 2+ создания задания (№249, 2026-10-06).
--
-- Владелец: после первого шага («Что нужно сделать?») — все пункты на одном
-- экране, без пошагового заполнения (docs/COMPOSER_ONE_FORM_2026-10.md,
-- вариант B). Было: `review.tsx` — ревью строками, шесть вопросов проходятся
-- по одному экрану на вопрос. Стало:
--   app_settings.composer_form = {"variant": "single" | "steps"};
--   get_app_flags() отдаёт composer_form (нет строки или чужое значение →
--   'single' — форма одним экраном, новый путь); остальные ключи — как в
--   0228, старые сборки лишний ключ игнорируют;
--   admin_set_composer_form(p_variant) — переключатель в веб-админке, по
--   образцу admin_set_composer_start; действие в журнале — set_composer_form.
--
-- Откат: 0229_composer_form_flag_rollback.sql (get_app_flags — ровно 0228,
-- строка настройки и записи журнала удаляются).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.
-- После применения: admin_set_composer_form — в server/src/rpc/routes.ts RPC_ALLOWLIST.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0229_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_set_composer_form(text)') IS NOT NULL THEN
    RAISE EXCEPTION '0229_already_applied';
  END IF;
  -- get_app_flags — ровно редакция 0228; ограничение журнала — ровно 0228.
  -- md5 — живые редакции после 0228 (прочитаны с базы 2026-10-06 перед
  -- применением).
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM 'd7d839a9d19baa71f4443b354893997f' THEN
    RAISE EXCEPTION '0229_get_app_flags_changed';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM '6465814b8ffedf86e7be0c152ef699a6' THEN
    RAISE EXCEPTION '0229_admin_actions_action_check_changed';
  END IF;
  IF to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL THEN
    RAISE EXCEPTION '0229_dependencies_missing';
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
  'experience_badge_revoke', 'set_composer_start', 'set_composer_form'
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
               WHERE s.key = 'composer_form' AND s.value->>'variant' IN ('single', 'steps')), 'single')
  );
$function$;

REVOKE ALL ON FUNCTION public.get_app_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_flags() TO anon, authenticated, service_role;

CREATE FUNCTION public.admin_set_composer_form(p_variant text)
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
  IF p_variant IS NULL OR p_variant NOT IN ('single', 'steps') THEN
    RAISE EXCEPTION 'bad_variant' USING errcode = '22023';
  END IF;
  SELECT value->>'variant' INTO v_old FROM public.app_settings WHERE key = 'composer_form';
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('composer_form', jsonb_build_object('variant', p_variant), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  PERFORM public.admin_log_action(
    'set_composer_form', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    'Форма задания: одним экраном / по шагам', NULL,
    jsonb_build_object('old', v_old, 'new', p_variant));
  RETURN public.get_app_flags();
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_composer_form(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_composer_form(text) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_set_composer_form(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_app_flags()', 'EXECUTE') THEN
    RAISE EXCEPTION '0229_grants_wrong';
  END IF;
  IF public.get_app_flags()->>'composer_form' IS DISTINCT FROM 'single' THEN
    RAISE EXCEPTION '0229_default_wrong';
  END IF;
END $$;

COMMIT;
