-- Откат 0229: get_app_flags — ровно редакция 0228 (без composer_form),
-- ограничение журнала — ровно 0228, переключатель и строка настройки
-- удаляются. Записи журнала set_composer_form, если были, удаляются: иначе
-- прежнее ограничение не встанет.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.admin_set_composer_form(text);
DELETE FROM public.app_settings WHERE key = 'composer_form';
DELETE FROM public.admin_actions WHERE action = 'set_composer_form';

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

COMMIT;
