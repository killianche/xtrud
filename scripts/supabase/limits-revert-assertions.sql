-- Rollback equivalence assertions for the two publication drafts, run after
--   supabase/migration-drafts/0132_revert_order_publish_limit.sql
--   supabase/migration-drafts/0134_revert_order_picked_master.sql
--
-- A rollback that only drops objects is not proven by the objects being gone. It
-- is proven by the database behaving again the way it behaved before, including
-- the parts that were broken — because a rollback that leaves half the new rule
-- in place is worse than either state.

DO $objects_are_gone$
BEGIN
  IF to_regprocedure('public.guard_order_publication_limit()') IS NOT NULL
     OR to_regprocedure('public.guard_order_picked_master()') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [revert]: a guard function survived the rollback';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
      AND tgname IN ('orders_publication_limit_guard', 'orders_picked_master_guard')
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL [revert]: a guard trigger survived the rollback';
  END IF;

  -- Every trigger that existed before the drafts is back, and nothing else was
  -- taken with them.
  IF EXISTS (
    SELECT 1 FROM public.fixture_trigger_baseline AS baseline
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
        AND tgname = baseline.tgname
    )
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL [revert]: the rollback removed a pre-existing trigger';
  END IF;

  -- The replaced function is byte-identical to the body 0133 overwrote, and
  -- carries its original comment again.
  IF (SELECT md5(prosrc) FROM pg_proc AS proc_row
      JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
      WHERE schema_row.nspname = 'public'
        AND proc_row.proname = 'trg_notify_order_cancelled_or_expired')
     IS DISTINCT FROM
     (SELECT prosrc_md5 FROM public.fixture_function_baseline
      WHERE proname = 'trg_notify_order_cancelled_or_expired') THEN
    RAISE EXCEPTION 'ASSERT FAIL [revert]: the notification function was not restored byte for byte';
  END IF;

  IF (SELECT obj_description(to_regprocedure('public.trg_notify_order_cancelled_or_expired()'), 'pg_proc'))
     IS DISTINCT FROM
     (SELECT proc_comment FROM public.fixture_function_baseline
      WHERE proname = 'trg_notify_order_cancelled_or_expired') THEN
    RAISE EXCEPTION 'ASSERT FAIL [revert]: the notification function comment was not restored';
  END IF;

  -- Not one policy moved, in either direction.
  IF (
       (SELECT count(*) FROM (
          SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
          FROM pg_policies WHERE schemaname = 'public'
          EXCEPT
          SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
          FROM public.fixture_policy_baseline
        ) AS added)
     + (SELECT count(*) FROM (
          SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
          FROM public.fixture_policy_baseline
          EXCEPT
          SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
          FROM pg_policies WHERE schemaname = 'public'
        ) AS removed)
     ) <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL [revert]: the rollback left the policy set changed';
  END IF;
END
$objects_are_gone$;

-- The behaviour is back too, gap and all. These assertions deliberately state
-- what rolling back costs.

SET ROLE authenticated;
SELECT public.fx_become('10000000-0000-4000-8000-000000000001');

SELECT public.fx_assert_allowed(
  'revert: the publication caps are gone — a fifth open task is accepted again',
  $$INSERT INTO public.orders (client_id, l2_id, title, city_id, status)
    VALUES ('10000000-0000-4000-8000-000000000001', 'plumbing', 'После отката', 'nazran', 'open')$$
);
SELECT public.fx_assert(
  'revert: the client is above the former cap once more',
  public.fx_open_count('10000000-0000-4000-8000-000000000001') > 3
);

SELECT public.fx_assert_allowed(
  'revert: picked_master_id accepts a master who never responded again',
  $$UPDATE public.orders SET picked_master_id = '50000000-0000-4000-8000-000000000005'
     WHERE id = 'aa000000-0000-4000-8000-0000000000a3'$$
);
SELECT public.fx_assert(
  'revert: the unverified anchor really was written',
  public.fx_order_field('aa000000-0000-4000-8000-0000000000a3', 'picked_master_id')
    = '50000000-0000-4000-8000-000000000005'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

\echo 'REVERT OK: both drafts rolled back to the pre-draft objects, comments and behaviour'
