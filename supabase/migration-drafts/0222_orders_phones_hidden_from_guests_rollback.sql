-- 0222 откат: гостю снова вся таблица orders (включая телефоны).
BEGIN;
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION '0222_rollback_must_run_as_postgres'; END IF;
END $$;
REVOKE SELECT ON public.orders FROM anon;
GRANT SELECT ON public.orders TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
