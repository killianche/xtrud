-- Откат 0240: убрать push о новой жалобе и журнал отправленных push.
-- Жалобы и очередь не затрагиваются. Суженные права на вставку жалобы НЕ
-- возвращаются: широкие права и были уязвимостью (ревью 2026-10-07).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0240_rollback_must_run_as_postgres';
  END IF;
  IF to_regprocedure('xtrud_private.notify_staff_new_report()') IS NULL THEN
    RAISE EXCEPTION '0240_not_applied';
  END IF;
END $$;

DROP TRIGGER reports_notify_staff ON public.reports;
DROP FUNCTION xtrud_private.notify_staff_new_report();
DROP TABLE xtrud_private.report_push_log;

COMMIT;
