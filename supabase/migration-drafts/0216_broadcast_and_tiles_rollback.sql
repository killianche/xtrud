-- Откат 0216: флаг плиток «Найти задание» и рассылка push.
--
-- ВНИМАНИЕ: таблица xtrud_private.broadcasts удаляется вместе с историей
-- рассылок. Если история нужна — до отката:
--   pg_dump -t xtrud_private.broadcasts -Fc > /opt/xtrud/backups/pre-0216-rollback-<ts>.dump
-- Уже разосланные уведомления остаются у людей в «Уведомлениях»
-- (public.notifications, data.kind = 'broadcast') — откат их не трогает.
-- Ключ app_settings.find_tiles удаляется; get_app_flags() возвращается к телу
-- 0205 (только find_screen) — новые сборки без ключа find_tiles показывают
-- 'grid' (договорённость клиента: нет ключа → прежний вид).
--
-- Журнал неизменяем (admin_actions_append_only). Если в нём уже есть записи
-- set_find_tiles/broadcast_push, ограничение не сужается обратно — лишнее
-- значение безвредно (как в 0214/0215). Если записей нет — ограничение
-- возвращается к редакции 0215.
--
-- Порядок: сначала убрать новые имена из server/src/rpc/routes.ts
-- RPC_ALLOWLIST и выложить xtrud-api/админку без вызовов, затем этот файл.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_n int;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0216_rollback_must_run_as_postgres';
  END IF;
  -- Откатываем только редакцию 0216: если позже 0217+ расширили список или
  -- поменяли get_app_flags, откат их не трогает.
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM 'e20f24ecd705e628fc7d08c65667f837' THEN
    RAISE EXCEPTION '0216_rollback_action_check_not_from_0216';
  END IF;
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM 'b8ac9b3f51bfe740802b8b0c7733b816' THEN
    RAISE EXCEPTION '0216_rollback_get_app_flags_not_from_0216';
  END IF;
  IF to_regclass('xtrud_private.broadcasts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM xtrud_private.broadcasts' INTO v_n;
    RAISE NOTICE '0216_rollback: dropping broadcasts history, rows=%', v_n;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_broadcasts(integer);
DROP FUNCTION IF EXISTS public.admin_broadcast_push(text, text, text);
DROP FUNCTION IF EXISTS public.admin_broadcast_preview(text);
DROP FUNCTION IF EXISTS xtrud_private.broadcast_recipients(text);
DROP TABLE IF EXISTS xtrud_private.broadcasts;
DROP FUNCTION IF EXISTS public.admin_set_find_tiles(text);

-- get_app_flags — ровно тело 0205; CREATE OR REPLACE сохраняет гранты.
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

DELETE FROM public.app_settings WHERE key = 'find_tiles';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_actions
                  WHERE action IN ('set_find_tiles', 'broadcast_push')) THEN
    ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
    ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
      'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show', 'category_hide'
    ]::text[]));
  ELSE
    RAISE NOTICE '0216_rollback: admin_actions has new actions, action CHECK kept';
  END IF;
END;
$$;

-- Проверки: тело get_app_flags — как до 0216, гость по-прежнему читает флаги.
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM '1d68d92ad2a6a90af367aa038984ed8f' THEN
    RAISE EXCEPTION '0216_rollback_get_app_flags_not_restored';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_app_flags()', 'EXECUTE') THEN
    RAISE EXCEPTION '0216_rollback_get_app_flags_lost_anon';
  END IF;
  IF to_regclass('xtrud_private.broadcasts') IS NOT NULL
     OR to_regprocedure('public.admin_set_find_tiles(text)') IS NOT NULL
     OR to_regprocedure('public.admin_broadcast_push(text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION '0216_rollback_objects_left';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
