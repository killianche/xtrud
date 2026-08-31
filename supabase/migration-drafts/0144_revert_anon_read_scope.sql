-- Откат 0143. Возвращает ровно тот ACL, что был снят, а не «права по памяти».
--
-- Откат возвращает и прежнюю дыру: аноним снова читает contact_phone.
-- Это осознанно — откат обязан быть точным возвратом, а не улучшением.

BEGIN;

DO $$
DECLARE
  v_missing int;
BEGIN
  IF to_regclass('public.anon_read_baseline_0143') IS NULL THEN
    RAISE EXCEPTION 'anon_read_scope_revert_without_baseline'
      USING DETAIL = 'Snapshot table is absent; the exact prior ACL is unknown.';
  END IF;

  SELECT count(*) INTO v_missing FROM (
    SELECT 'users' t UNION ALL SELECT 'master_profiles'
  ) x WHERE NOT EXISTS (
    SELECT 1 FROM public.anon_read_baseline_0143 b WHERE b.table_name = x.t);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'anon_read_scope_revert_baseline_incomplete';
  END IF;

  EXECUTE 'REVOKE SELECT ON TABLE public.users FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE public.master_profiles FROM anon';
  EXECUTE 'GRANT SELECT ON TABLE public.users TO anon';
  EXECUTE 'GRANT SELECT ON TABLE public.master_profiles TO anon';

  IF NOT has_column_privilege('anon','public.users','contact_phone','SELECT') THEN
    RAISE EXCEPTION 'anon_read_scope_revert_incomplete'
      USING DETAIL = 'Table-level SELECT was not restored.';
  END IF;

  RAISE WARNING 'anon_read_scope откачен: аноним снова читает contact_phone и реквизиты мастеров.';
END
$$;

DROP TABLE IF EXISTS public.anon_read_baseline_0143;

COMMIT;
