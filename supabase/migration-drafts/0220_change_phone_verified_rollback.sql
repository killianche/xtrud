-- 0220 откат: вернуть прямую запись users_private ролям API, убрать функции.
-- ВНИМАНИЕ: снова открывает смену номера входа без проверки — только при
-- аварии. Выровненные адреса входа (шаг 4) не откатываются: они верны.
BEGIN;
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION '0220_rollback_must_run_as_postgres'; END IF;
END $$;
DROP FUNCTION IF EXISTS xtrud_private.change_account_phone(uuid, text);
DROP FUNCTION IF EXISTS xtrud_private.notify_security_event(uuid, text);
GRANT INSERT, UPDATE, DELETE ON public.users_private TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
