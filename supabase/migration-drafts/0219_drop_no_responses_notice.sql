-- 0219: убрать уведомление «Пока нет откликов» (№211).
--
-- Владелец, 2026-10-04 (скриншот push): «уведомление о том, что нет откликов,
-- не нужно, чтобы мне советовали добавить фото — убери».
--
-- Было: задача pg_cron hourly_no_responses (каждый час в :15) вызывала
--   public.notify_orders_without_responses() — push «Пока нет откликов /
--   <название> / Совет: добавьте фото и бюджет…» заказчику через сутки после
--   публикации задания без откликов (0175, 0207).
-- Стало: задачи нет, функции нет. Старые уведомления в списке остаются.
--
-- Откат: 0219_drop_no_responses_notice_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0219_must_run_as_postgres';
  END IF;
  -- Тело функции — как в 0207 (снято 2026-10-04).
  IF md5(pg_get_functiondef('public.notify_orders_without_responses()'::regprocedure))
     IS DISTINCT FROM 'edf5e14ac6a1124248c3b71e1b40d0cb' THEN
    RAISE EXCEPTION '0219_function_changed';
  END IF;
END;
$$;

SELECT cron.unschedule('hourly_no_responses');
DROP FUNCTION public.notify_orders_without_responses();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly_no_responses')
     OR to_regprocedure('public.notify_orders_without_responses()') IS NOT NULL THEN
    RAISE EXCEPTION '0219_not_removed';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
