-- Откат 0228: get_app_flags — ровно редакция 0217 (без composer_start),
-- переключатель и строка настройки удаляются. Журнал и его ограничение не
-- трогаются — журнал неизменяем (см. ниже).

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.admin_set_composer_start(text);
DELETE FROM public.app_settings WHERE key = 'composer_start';

-- Журнал admin_actions неизменяем (триггеры admin_actions_no_delete/_no_update):
-- записи 'set_composer_start' остаются, и список допустимых действий тоже остаётся с
-- 'set_composer_start' — лишнее значение безвредно, а прежний CHECK не встал бы на
-- уже сделанных записях (найдено проверкой безопасности 0230, 2026-10-06).

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
               WHERE s.key = 'require_login' AND s.value->>'enabled' IN ('true', 'false')), false)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_app_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_flags() TO anon, authenticated, service_role;

COMMIT;
