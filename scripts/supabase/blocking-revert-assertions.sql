-- Assertions executed after 0125_revert_user_blocking_core.sql.
--
-- A rollback plan that has never been executed is not a rollback plan. This
-- file proves three things about the revert:
--   1. every object the forward migration added for enforcement is gone;
--   2. the policy set on every pre-existing table is byte-identical to the
--      pre-0124 baseline, including policy expressions;
--   3. the visible row sets are back to the pre-0124 baseline even though the
--      block rows still exist — and public.user_blocks itself is preserved.

DO $objects_removed$
BEGIN
  IF to_regprocedure('xtrud_private.current_user_blocked_counterparties()') IS NOT NULL
     OR to_regprocedure('xtrud_private.current_user_can_interact_with(uuid)') IS NOT NULL
     OR to_regprocedure('xtrud_private.order_client_id(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'blocking_revert_left_helper_functions_behind';
  END IF;

  -- The private schema was created by 0124 and left empty by the revert, so it
  -- must be gone too.
  IF to_regnamespace('xtrud_private') IS NOT NULL THEN
    RAISE EXCEPTION 'blocking_revert_left_the_private_schema_behind';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'orders_block_relation_restrictive',
        'order_responses_block_relation_select_restrictive',
        'order_responses_block_relation_insert_restrictive',
        'order_responses_block_relation_update_restrictive'
      )
  ) THEN
    RAISE EXCEPTION 'blocking_revert_left_restrictive_policies_behind';
  END IF;
END
$objects_removed$;

DO $data_preserved$
BEGIN
  IF to_regclass('public.user_blocks') IS NULL THEN
    RAISE EXCEPTION 'blocking_revert_destroyed_the_block_table';
  END IF;

  -- Both blocks created during the postflight phase must survive the rollback.
  IF (SELECT count(*) FROM public.user_blocks) <> 2 THEN
    RAISE EXCEPTION 'blocking_revert_destroyed_user_safety_choices';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_blocks'
  ) <> 3 THEN
    RAISE EXCEPTION 'blocking_revert_left_user_blocks_unprotected';
  END IF;
END
$data_preserved$;

DO $policy_set_restored$
DECLARE
  v_lost bigint;
  v_extra_outside_user_blocks bigint;
BEGIN
  SELECT count(*) INTO v_lost
  FROM (
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM public.fixture_policy_baseline
    EXCEPT
    SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
  ) AS lost;

  IF v_lost <> 0 THEN
    RAISE EXCEPTION 'blocking_revert_did_not_restore_% _baseline_policies', v_lost;
  END IF;

  SELECT count(*) INTO v_extra_outside_user_blocks
  FROM (
    SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
    EXCEPT
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM public.fixture_policy_baseline
  ) AS extra
  WHERE extra.tablename <> 'user_blocks';

  -- The only surviving difference is public.user_blocks and its own policies,
  -- which the revert keeps on purpose.
  IF v_extra_outside_user_blocks <> 0 THEN
    RAISE EXCEPTION 'blocking_revert_left_% _unexpected_policies', v_extra_outside_user_blocks;
  END IF;
END
$policy_set_restored$;

SET ROLE anon;
SELECT public.fixture_capture_visibility('after_revert', 'anon', NULL);
RESET ROLE;

SET ROLE authenticated;
SELECT public.fixture_capture_visibility('after_revert', 'client_a', '10000000-0000-4000-8000-000000000001');
SELECT public.fixture_capture_visibility('after_revert', 'master_b', '20000000-0000-4000-8000-000000000002');
SELECT public.fixture_capture_visibility('after_revert', 'master_c', '30000000-0000-4000-8000-000000000003');
SELECT public.fixture_capture_visibility('after_revert', 'client_d', '40000000-0000-4000-8000-000000000004');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $visibility_restored$
DECLARE
  v_diff bigint;
BEGIN
  SELECT count(*) INTO v_diff
  FROM (
    (
      SELECT probe.actor_label, probe.relname, probe.row_id
      FROM public.fixture_visibility_probe AS probe
      JOIN public.fixture_seeded_rows AS seeded
        ON seeded.relname = probe.relname AND seeded.row_id = probe.row_id
      WHERE probe.phase = 'before'
      EXCEPT ALL
      SELECT probe.actor_label, probe.relname, probe.row_id
      FROM public.fixture_visibility_probe AS probe
      JOIN public.fixture_seeded_rows AS seeded
        ON seeded.relname = probe.relname AND seeded.row_id = probe.row_id
      WHERE probe.phase = 'after_revert'
    )
    UNION ALL
    (
      SELECT probe.actor_label, probe.relname, probe.row_id
      FROM public.fixture_visibility_probe AS probe
      JOIN public.fixture_seeded_rows AS seeded
        ON seeded.relname = probe.relname AND seeded.row_id = probe.row_id
      WHERE probe.phase = 'after_revert'
      EXCEPT ALL
      SELECT probe.actor_label, probe.relname, probe.row_id
      FROM public.fixture_visibility_probe AS probe
      JOIN public.fixture_seeded_rows AS seeded
        ON seeded.relname = probe.relname AND seeded.row_id = probe.row_id
      WHERE probe.phase = 'before'
    )
  ) AS symmetric_difference;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'blocking_revert_did_not_restore_visibility: % differing rows', v_diff;
  END IF;
END
$visibility_restored$;

\echo 'REVERT OK: enforcement removed, policy set and visibility restored, block rows preserved'
