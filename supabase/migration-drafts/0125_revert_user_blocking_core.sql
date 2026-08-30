-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- 0125_revert_user_blocking_core.sql
--
-- Tested rollback for 0124_user_blocking_core.sql.
--
-- Rollback is a NEW forward-only migration, never an edit of the applied file
-- (docs/AGENT_WORKFLOW.md section 4). 0124 only ADDS objects and never renames,
-- rewrites or drops an existing policy, so dropping exactly the three
-- RESTRICTIVE policies restores the previous visible row sets exactly. The
-- accompanying fixture proves that by comparing pg_policies and the visible
-- row sets against the pre-0124 baseline.
--
-- public.user_blocks is deliberately KEPT. Its rows are user decisions about
-- personal safety; destroying them to undo a policy change would be a data
-- loss disguised as a rollback. Dropping the table is a separate, explicitly
-- approved step that must be preceded by an export.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.user_blocks') IS NULL THEN
    RAISE EXCEPTION 'user_blocking_revert_nothing_to_revert'
      USING ERRCODE = 'P0001',
            HINT = '0124 was never applied here. Do not run a revert against an unknown state.';
  END IF;
END
$guard$;

DROP POLICY IF EXISTS orders_block_relation_restrictive
  ON public.orders;
DROP POLICY IF EXISTS order_responses_block_relation_select_restrictive
  ON public.order_responses;
DROP POLICY IF EXISTS order_responses_block_relation_insert_restrictive
  ON public.order_responses;
DROP POLICY IF EXISTS order_responses_block_relation_update_restrictive
  ON public.order_responses;

-- Helpers are dropped after the policies that reference them.
DROP FUNCTION IF EXISTS xtrud_private.order_client_id(uuid);
DROP FUNCTION IF EXISTS xtrud_private.current_user_can_interact_with(uuid);
DROP FUNCTION IF EXISTS xtrud_private.current_user_blocked_counterparties();

-- The private helper schema is removed only when this migration left it empty.
-- A non-empty schema means something else started using it, and dropping that
-- blindly would be a data-loss rollback rather than a revert.
DO $drop_private_schema$
DECLARE
  v_remaining bigint;
BEGIN
  IF to_regnamespace('xtrud_private') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM pg_class
  WHERE relnamespace = to_regnamespace('xtrud_private')::oid;

  SELECT v_remaining + count(*) INTO v_remaining
  FROM pg_proc
  WHERE pronamespace = to_regnamespace('xtrud_private')::oid;

  SELECT v_remaining + count(*) INTO v_remaining
  FROM pg_type
  WHERE typnamespace = to_regnamespace('xtrud_private')::oid
    AND typtype <> 'b';

  IF v_remaining = 0 THEN
    DROP SCHEMA xtrud_private RESTRICT;
  ELSE
    RAISE NOTICE 'xtrud_private kept: % object(s) remain and are not owned by this migration', v_remaining;
  END IF;
END
$drop_private_schema$;

COMMENT ON TABLE public.user_blocks IS
  'Owner-managed UGC safety blocks. Enforcement policies are currently reverted (0125); rows are preserved so that re-enabling enforcement restores user intent. Do not drop without an approved export.';

COMMIT;
