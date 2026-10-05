-- 0223 откат: вернуть прежние права (запись cities вошедшим, MAINTAIN гостю).
BEGIN;
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION '0223_rollback_must_run_as_postgres'; END IF;
END $$;
GRANT INSERT, UPDATE, DELETE, MAINTAIN ON public.cities TO authenticated;
GRANT MAINTAIN ON public.cities, public.orders, public.master_service_areas TO anon;
COMMIT;
