-- Behavioural assertions executed after 0124_user_blocking_core.sql on top of
-- blocking-preflight-fixture.sql. Passing here proves the draft's internal
-- contract against a synthetic current-state schema. It is NOT production
-- approval: the live schema, ACL and policy set remain unverified.

-- ===========================================================================
-- 1. Decoupling: the unrelated contact surface must be untouched
-- ===========================================================================

DO $contact_untouched$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef(to_regprocedure('public.get_master_phone(uuid)'));

  IF v_definition !~* 'coalesce' OR v_definition !~* 'users_private' THEN
    RAISE EXCEPTION 'blocking_migration_rewrote_get_master_phone';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_master_phone(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'blocking_migration_revoked_anonymous_contact_lookup';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.users', 'contact_phone', 'SELECT') THEN
    RAISE EXCEPTION 'blocking_migration_narrowed_contact_column_grant';
  END IF;

  IF public.get_master_phone('20000000-0000-4000-8000-000000000002')
       IS DISTINCT FROM '+79000000000' THEN
    RAISE EXCEPTION 'blocking_migration_changed_contact_result';
  END IF;

  -- The 0098 private-identifier fallback is CURRENT behaviour. Blocking must
  -- neither rely on it nor silently remove it; narrowing it is the separate,
  -- separately released contact phase.
  IF public.get_master_phone('30000000-0000-4000-8000-000000000003')
       IS DISTINCT FROM '+79000000003' THEN
    RAISE EXCEPTION 'blocking_migration_changed_contact_fallback';
  END IF;
END
$contact_untouched$;

-- ===========================================================================
-- 2. Structure, ACL and policy composition (point 6 of the review list)
-- ===========================================================================

DO $structure$
DECLARE
  v_new_policies bigint;
  v_changed bigint;
BEGIN
  -- 2a. Helpers are SECURITY DEFINER and bypass RLS deliberately.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS function_row
    WHERE function_row.oid = to_regprocedure('public.current_user_blocked_counterparties()')
      AND function_row.prosecdef
      AND function_row.proconfig @> ARRAY['row_security=off']
  ) THEN
    RAISE EXCEPTION 'blocking_array_helper_is_not_definer_row_security_off';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS function_row
    WHERE function_row.oid = to_regprocedure('public.current_user_can_interact_with(uuid)')
      AND function_row.prosecdef
      AND function_row.proconfig @> ARRAY['row_security=off']
  ) THEN
    RAISE EXCEPTION 'blocking_scalar_helper_is_not_definer_row_security_off';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS function_row
    WHERE function_row.oid = to_regprocedure('public.order_client_id(uuid)')
      AND function_row.prosecdef
      AND function_row.proconfig @> ARRAY['row_security=off']
  ) THEN
    RAISE EXCEPTION 'blocking_order_owner_helper_is_not_definer_row_security_off';
  END IF;

  -- 2b. Table grants are explicit, not inherited from default privileges.
  IF has_table_privilege('anon', 'public.user_blocks', 'SELECT')
     OR has_table_privilege('anon', 'public.user_blocks', 'INSERT')
     OR has_table_privilege('anon', 'public.user_blocks', 'UPDATE')
     OR has_table_privilege('anon', 'public.user_blocks', 'DELETE') THEN
    RAISE EXCEPTION 'blocking_anon_retains_user_blocks_privilege';
  END IF;

  IF has_table_privilege('authenticated', 'public.user_blocks', 'UPDATE') THEN
    RAISE EXCEPTION 'blocking_user_blocks_row_is_not_immutable';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.user_blocks', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.user_blocks', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.user_blocks', 'DELETE') THEN
    RAISE EXCEPTION 'blocking_owner_cannot_manage_own_blocks';
  END IF;

  -- The fixture granted ALL on future tables to service_role; the migration
  -- must have stripped it back to nothing.
  IF has_table_privilege('service_role', 'public.user_blocks', 'SELECT')
     OR has_table_privilege('service_role', 'public.user_blocks', 'INSERT')
     OR has_table_privilege('service_role', 'public.user_blocks', 'UPDATE')
     OR has_table_privilege('service_role', 'public.user_blocks', 'DELETE') THEN
    RAISE EXCEPTION 'blocking_service_role_inherited_default_privileges';
  END IF;

  -- 2c. Function grants.
  IF NOT has_function_privilege('anon', 'public.current_user_blocked_counterparties()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.current_user_blocked_counterparties()', 'EXECUTE') THEN
    RAISE EXCEPTION 'blocking_array_helper_not_executable_by_api_roles';
  END IF;

  IF has_function_privilege('anon', 'public.order_client_id(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.order_client_id(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.current_user_blocked_counterparties()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.current_user_can_interact_with(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'blocking_helper_grants_are_wider_than_declared';
  END IF;

  -- 2d. RESTRICTIVE composition, and no PERMISSIVE policy was rewritten.
  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'RESTRICTIVE'
      AND policyname IN (
        'orders_block_relation_restrictive',
        'order_responses_block_relation_select_restrictive',
        'order_responses_block_relation_insert_restrictive'
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'blocking_restrictive_policies_missing_or_not_restrictive';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_responses'
      AND permissive = 'RESTRICTIVE'
      AND cmd = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'blocking_unexpected_restrictive_update_policy';
  END IF;

  SELECT count(*) INTO v_changed
  FROM (
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM public.fixture_policy_baseline
    EXCEPT
    SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
  ) AS lost;

  IF v_changed <> 0 THEN
    RAISE EXCEPTION 'blocking_migration_altered_or_dropped_% _preexisting_policies', v_changed;
  END IF;

  SELECT count(*) INTO v_new_policies
  FROM (
    SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
    EXCEPT
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM public.fixture_policy_baseline
  ) AS added;

  -- 3 RESTRICTIVE + 3 owner policies on public.user_blocks, nothing else.
  IF v_new_policies <> 6 THEN
    RAISE EXCEPTION 'blocking_migration_added_unexpected_policy_count: %', v_new_policies;
  END IF;
END
$structure$;

-- ===========================================================================
-- 3. INERTNESS WITH AN EMPTY user_blocks (point 1 — the compatibility proof
--    for the published iOS 1.0.1). Captured BEFORE any block exists.
-- ===========================================================================

DO $no_blocks_yet$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_blocks) THEN
    RAISE EXCEPTION 'blocking_fixture_expected_empty_user_blocks_at_this_point';
  END IF;
END
$no_blocks_yet$;

SET ROLE anon;
SELECT public.fixture_capture_visibility('after', 'anon', NULL);
RESET ROLE;

SET ROLE authenticated;
SELECT public.fixture_capture_visibility('after', 'client_a', '10000000-0000-4000-8000-000000000001');
SELECT public.fixture_capture_visibility('after', 'master_b', '20000000-0000-4000-8000-000000000002');
SELECT public.fixture_capture_visibility('after', 'master_c', '30000000-0000-4000-8000-000000000003');
SELECT public.fixture_capture_visibility('after', 'client_d', '40000000-0000-4000-8000-000000000004');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $inertness$
DECLARE
  v_diff bigint;
BEGIN
  SELECT count(*) INTO v_diff
  FROM (
    (
      SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'before'
      EXCEPT ALL
      SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'after'
    )
    UNION ALL
    (
      SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'after'
      EXCEPT ALL
      SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'before'
    )
  ) AS symmetric_difference;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'blocking_migration_is_not_inert_with_empty_user_blocks: % differing rows', v_diff;
  END IF;
END
$inertness$;

-- Point 4: a response stays visible to its own master even when the order row
-- itself is invisible (cancelled), as long as no block exists. A plain
-- sub-SELECT on public.orders inside the policy would fail this.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', false);
DO $order_status_independence$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'
  ) THEN
    RAISE EXCEPTION 'blocking_fixture_cancelled_order_unexpectedly_visible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.order_responses WHERE id = 'c0000000-0000-4000-8000-00000000000c'
  ) THEN
    RAISE EXCEPTION 'blocking_policy_entangled_response_visibility_with_order_status';
  END IF;
END
$order_status_independence$;
RESET ROLE;

-- ===========================================================================
-- 4. Planner shape (point 5): the array helper must be an InitPlan evaluated
--    once per query, not a per-row filter call.
-- ===========================================================================

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
DO $plan_shape$
DECLARE
  v_line text;
  v_plan text := '';
BEGIN
  FOR v_line IN EXECUTE 'EXPLAIN (COSTS OFF) SELECT id FROM public.orders' LOOP
    v_plan := v_plan || v_line || E'\n';
  END LOOP;

  IF v_plan !~ 'InitPlan' THEN
    RAISE EXCEPTION 'blocking_policy_helper_is_not_folded_into_an_initplan: %', v_plan;
  END IF;

  IF v_plan ~ 'Filter:[^\n]*current_user_blocked_counterparties' THEN
    RAISE EXCEPTION 'blocking_policy_helper_is_evaluated_per_row: %', v_plan;
  END IF;

  RAISE NOTICE 'plan shape for authenticated feed read:%', E'\n' || v_plan;
END
$plan_shape$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- ===========================================================================
-- 5. Block ownership and write rules
-- ===========================================================================

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);

DO $block_write_rules$
BEGIN
  BEGIN
    INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'blocking_self_block_guard_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Blocking on someone else's behalf must be impossible.
  BEGIN
    INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (
      '40000000-0000-4000-8000-000000000004',
      '20000000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'blocking_foreign_blocker_id_not_rejected';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$block_write_rules$;

INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);

DO $blocker_view$
BEGIN
  IF (SELECT count(*) FROM public.user_blocks) <> 1 THEN
    RAISE EXCEPTION 'blocking_owner_cannot_read_own_block';
  END IF;

  -- Point 3, direction 1: the blocker loses sight of the blocked master's work.
  IF EXISTS (
    SELECT 1 FROM public.order_responses
    WHERE master_id = '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'blocking_blocked_master_response_still_visible_to_blocker';
  END IF;

  -- Own orders stay visible to their owner.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = '50000000-0000-4000-8000-000000000005'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'
  ) THEN
    RAISE EXCEPTION 'blocking_owner_lost_access_to_own_orders';
  END IF;

  -- An unrelated open order is untouched.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'blocking_unrelated_order_hidden_from_blocker';
  END IF;
END
$blocker_view$;

-- Point 3, direction 2: the blocked side loses sight of the blocker.
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', false);

DO $blocked_view$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE client_id = '10000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'blocking_is_not_symmetric_for_orders';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_responses
    WHERE id IN (
      'a0000000-0000-4000-8000-00000000000a',
      'c0000000-0000-4000-8000-00000000000c'
    )
  ) THEN
    RAISE EXCEPTION 'blocking_is_not_symmetric_for_responses';
  END IF;

  -- A block is not a ban: unrelated work is untouched.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'blocking_leaked_into_unrelated_orders';
  END IF;

  -- The blocked user must not be able to enumerate who blocked them.
  IF EXISTS (SELECT 1 FROM public.user_blocks) THEN
    RAISE EXCEPTION 'blocking_blocked_user_can_read_foreign_block_rows';
  END IF;

  -- New interaction with the blocking party is rejected...
  BEGIN
    INSERT INTO public.order_responses (order_id, master_id, l2_id) VALUES (
      '50000000-0000-4000-8000-000000000005',
      '20000000-0000-4000-8000-000000000002',
      'plumbing'
    );
    RAISE EXCEPTION 'blocking_blocked_response_insert_not_rejected';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- ...while responding to anyone else still works (positive control).
  INSERT INTO public.order_responses (order_id, master_id, l2_id) VALUES (
    '60000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000002',
    'plumbing'
  );
END
$blocked_view$;

-- An unrelated third party is unaffected by someone else's block.
SELECT set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);
DO $third_party_view$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = '50000000-0000-4000-8000-000000000005'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'blocking_leaked_into_a_third_party_feed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.order_responses
    WHERE id = 'b0000000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'blocking_leaked_into_a_third_party_response';
  END IF;
END
$third_party_view$;

-- ---------------------------------------------------------------------------
-- 5b. A block must not leak into UNRELATED responses (point 4, real shape).
--
-- With an empty block list, `NULL = ANY (ARRAY[]::uuid[])` is false, so a
-- policy that resolves the order owner through a plain sub-SELECT on
-- public.orders looks harmless. The regression only appears once the viewer
-- holds at least one block: the sub-SELECT then runs under the viewer's own
-- RLS, an invisible order resolves to NULL, `NULL = ANY (non_empty)` is NULL,
-- and NOT NULL denies the row. master_c below blocks client_d and must still
-- see its own response to an invisible order of client_a, whom it never
-- blocked. public.order_client_id exists precisely to make this hold.
-- ---------------------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', false);

INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004'
);

DO $unrelated_block_leak$
BEGIN
  -- The order itself is invisible: cancelled, and master_c is not a participant.
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE id = '80000000-0000-4000-8000-000000000008'
  ) THEN
    RAISE EXCEPTION 'blocking_fixture_second_cancelled_order_unexpectedly_visible';
  END IF;

  -- ...yet the viewer's own response on it must remain visible, because the
  -- order owner (client_a) is not blocked by this viewer.
  IF NOT EXISTS (
    SELECT 1 FROM public.order_responses
    WHERE id = 'd0000000-0000-4000-8000-00000000000d'
  ) THEN
    RAISE EXCEPTION 'blocking_unrelated_block_leaked_into_own_response';
  END IF;

  -- The block master_c actually made is still enforced in both surfaces.
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'blocking_blocked_client_order_still_visible_to_blocker';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_responses
    WHERE id = 'b0000000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'blocking_blocked_client_response_still_visible_to_blocker';
  END IF;
END
$unrelated_block_leak$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- ===========================================================================
-- 6. The anonymous feed is unaffected by an existing block (point 2)
-- ===========================================================================

SET ROLE anon;
SELECT public.fixture_capture_visibility('after_block', 'anon', NULL);

DO $anonymous_view$
DECLARE
  v_diff bigint;
BEGIN
  IF public.current_user_can_interact_with(
    '20000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'blocking_anonymous_interaction_helper_not_fail_closed';
  END IF;

  IF public.current_user_blocked_counterparties() <> ARRAY[]::uuid[] THEN
    RAISE EXCEPTION 'blocking_anonymous_counterparty_helper_not_empty';
  END IF;

  BEGIN
    PERFORM public.order_client_id('50000000-0000-4000-8000-000000000005');
    RAISE EXCEPTION 'blocking_anonymous_order_owner_helper_not_revoked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM public.user_blocks;
    RAISE EXCEPTION 'blocking_anonymous_block_table_read_not_revoked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_diff
  FROM (
    (
      SELECT relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'before' AND actor_label = 'anon'
      EXCEPT ALL
      SELECT relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'after_block' AND actor_label = 'anon'
    )
    UNION ALL
    (
      SELECT relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'after_block' AND actor_label = 'anon'
      EXCEPT ALL
      SELECT relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'before' AND actor_label = 'anon'
    )
  ) AS symmetric_difference;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'blocking_changed_the_anonymous_feed: % differing rows', v_diff;
  END IF;
END
$anonymous_view$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

\echo 'POSTFLIGHT OK: blocking contract holds on the synthetic current-state fixture'
