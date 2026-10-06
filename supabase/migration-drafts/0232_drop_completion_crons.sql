-- 0232 — снять ночные задачи этапа «выполнено» (TASKS №255, 2026-10-06).
--
-- С 0208 выбор мастера сразу закрывает задание (`completed`), этапа
-- «Работа выполнена / ждёт подтверждения» нет, отзыв клиент оставляет когда
-- захочет. Две ночные задачи обслуживали старую модель и работают вхолостую:
--   nightly_auto_confirm  → auto_confirm_completions()   (awaiting_confirmation)
--   nightly_cancel_stale  → cancel_stale_in_progress()   (in_progress)
-- Функции не удаляются: на них ничего не ломается, а откат — одна строка.
--
-- Откат (тоже от supabase_admin, чтобы владелец задач остался прежним):
--   SELECT cron.schedule('nightly_auto_confirm', '0 4 * * *', 'SELECT public.auto_confirm_completions();');
--   SELECT cron.schedule('nightly_cancel_stale', '0 5 * * *', 'SELECT public.cancel_stale_in_progress();');

BEGIN;

DO $$
DECLARE
  v_jobs int;
  v_rows int;
BEGIN
  SELECT count(*) INTO v_jobs FROM cron.job
   WHERE (jobname = 'nightly_auto_confirm' AND command = 'SELECT public.auto_confirm_completions();')
      OR (jobname = 'nightly_cancel_stale' AND command = 'SELECT public.cancel_stale_in_progress();');
  IF v_jobs <> 2 THEN
    RAISE EXCEPTION '0232: ожидались 2 задачи cron, найдено %', v_jobs;
  END IF;

  SELECT count(*) INTO v_rows FROM public.orders
   WHERE status IN ('in_progress', 'awaiting_confirmation');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION '0232: есть % заданий в старых статусах — сначала разобрать', v_rows;
  END IF;
END $$;

-- Задачи заведены старой установкой Supabase от supabase_admin; снять чужую
-- задачу pg_cron не даёт, поэтому миграция применяется от него:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q
SELECT cron.unschedule(jobid) FROM cron.job
 WHERE jobname IN ('nightly_auto_confirm', 'nightly_cancel_stale');

COMMIT;
