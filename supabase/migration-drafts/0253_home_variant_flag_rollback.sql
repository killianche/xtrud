-- Откат 0253: get_app_flags — ровно живая редакция до 0253 (редакция 0229,
-- md5 e79f34ba6911ccfa8652b545fb4860f2, без home_variant); переключатель и
-- строка настройки удаляются. Журнал и его ограничение не трогаются — журнал
-- неизменяем (см. ниже), как в откате 0229.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.
-- Порядок: сначала убрать admin_set_home_variant из server/src/rpc/routes.ts и
-- выложить xtrud-api (иначе путь /v2/rpc/admin_set_home_variant вернёт ошибку
-- базы), карточку в админке — тогда же.
--
-- ВНИМАНИЕ (xtrud-security, 2026-10-21): откат удаляет строку home_variant,
-- и сборки с новой главной без ключа покажут НОВУЮ главную. Если в админке
-- стояло «Прежняя», откат 0253 молча вернёт новую. Откатывать 0253, только
-- когда в сторе уже сборка без новой главной; иначе — переключатель в админке.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0253_rollback_must_run_as_postgres';
  END IF;
  -- Редакция get_app_flags после 0253 (снята с живой базы 2026-10-21): если
  -- её успела поменять другая миграция, откат молча стёр бы её ключи.
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM '649e9a770bf86f476ce2d7ac93c2a1f3' THEN
    RAISE EXCEPTION '0253_rollback_get_app_flags_changed';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.admin_set_home_variant(text);
DELETE FROM public.app_settings WHERE key = 'home_variant';

-- Журнал admin_actions неизменяем (триггеры admin_actions_no_delete/_no_update/
-- _no_truncate, проверено на живой базе 2026-10-21): записи 'set_home_variant'
-- остаются, и список допустимых действий тоже остаётся с 'set_home_variant' —
-- лишнее значение безвредно, а прежний CHECK не встал бы на уже сделанных
-- записях (тот же разбор, что в откате 0229 / проверке 0230).

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

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM 'e79f34ba6911ccfa8652b545fb4860f2' THEN
    RAISE EXCEPTION '0253_rollback_get_app_flags_not_restored';
  END IF;
  IF to_regprocedure('public.admin_set_home_variant(text)') IS NOT NULL THEN
    RAISE EXCEPTION '0253_rollback_function_left';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
