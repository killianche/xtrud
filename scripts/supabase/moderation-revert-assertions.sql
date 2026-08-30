-- Rollback equivalence assertions for
--   supabase/migration-drafts/0127_revert_suspension_enforcement.sql
--   supabase/migration-drafts/0129_revert_order_moderation.sql
--
-- Two questions are answered here, and the second matters more than the first:
--   1. is every object gone and is every pre-existing policy and row exactly as
--      it was before the drafts;
--   2. what does rolling back COST. A rollback that silently reopens the gap it
--      closed must say so out loud, not be discovered in production — and it
--      must reopen ONLY its own gap. The applied migration 0130 has to be
--      standing, unchanged, on the other side of both rollbacks.

\set ON_ERROR_STOP on

-- ===========================================================================
-- A. Nothing of the drafts is left behind
-- ===========================================================================

DO $objects_gone$
BEGIN
  PERFORM public.fx_assert('0127: content guard function removed',
    to_regprocedure('public.guard_content_author_active()') IS NULL);
  PERFORM public.fx_assert('0127: users status guard function removed',
    to_regprocedure('public.guard_user_status_column()') IS NULL);
  -- THE ONE THING A ROLLBACK MUST NOT DO. guard_user_privilege_columns belongs
  -- to the applied migration 0130. Removing it here would turn a rollback of a
  -- moderation feature into a privilege escalation.
  PERFORM public.fx_assert('0127: the applied is_admin guard SURVIVED the rollback',
    to_regprocedure('public.guard_user_privilege_columns()') IS NOT NULL);
  PERFORM public.fx_assert('0127: the applied trigger survived the rollback', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'users' AND t.tgname = 'users_guard_privilege_columns'
      AND NOT t.tgisinternal AND t.tgenabled <> 'D'));
  PERFORM public.fx_assert('0129: order moderation guard function removed',
    to_regprocedure('public.guard_order_moderation_columns()') IS NULL);
  PERFORM public.fx_assert('0129: response target guard function removed',
    to_regprocedure('public.guard_response_target_not_hidden()') IS NULL);
  PERFORM public.fx_assert('0129: moderator RPC removed',
    to_regprocedure('public.admin_set_order_hidden(uuid, boolean)') IS NULL);

  PERFORM public.fx_assert('every draft trigger removed', NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN ('orders_author_active_guard',
                     'order_responses_author_active_guard',
                     'reviews_author_active_guard',
                     'users_guard_status_column',
                     'orders_moderation_columns_guard',
                     'order_responses_hidden_order_guard')));

  PERFORM public.fx_assert('every draft policy removed', NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN ('orders_moderation_hidden_anon_restrictive',
                         'orders_moderation_hidden_auth_restrictive',
                         'orders_admin_select')));

  PERFORM public.fx_assert('0129: moderation columns removed', NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name IN ('moderation_hidden_at', 'moderation_hidden_by')));

  -- The pre-existing triggers of the fixture must survive the rollback.
  PERFORM public.fx_assert('pre-existing updated_at triggers survived', (
    SELECT count(*) = 3 FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN ('orders_set_updated_at', 'order_responses_set_updated_at',
                     'reviews_set_updated_at')));
END
$objects_gone$;

DO $policies_identical$
DECLARE
  v_drift text;
BEGIN
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ')
  INTO v_drift
  FROM (
    (SELECT tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
       FROM pg_policies WHERE schemaname = 'public'
     EXCEPT
     SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
       FROM public.fixture_policy_baseline)
    UNION ALL
    (SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
       FROM public.fixture_policy_baseline
     EXCEPT
     SELECT tablename, policyname, permissive, roles::text, cmd, qual, with_check
       FROM pg_policies WHERE schemaname = 'public')
  ) AS drift;

  IF v_drift IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL: the policy set after rollback differs from the baseline: %', v_drift;
  END IF;
END
$policies_identical$;

-- ===========================================================================
-- B. Every reader sees exactly what they saw before the drafts
-- ===========================================================================

SET ROLE anon;
SELECT public.fixture_capture_visibility('after_revert', 'anon', NULL);
RESET ROLE;

SET ROLE authenticated;
SELECT public.fixture_capture_visibility('after_revert', 'admin_m',  'f0000000-0000-4000-8000-00000000000f');
SELECT public.fixture_capture_visibility('after_revert', 'client_a', '10000000-0000-4000-8000-000000000001');
SELECT public.fixture_capture_visibility('after_revert', 'master_b', '20000000-0000-4000-8000-000000000002');
SELECT public.fixture_capture_visibility('after_revert', 'client_s', '30000000-0000-4000-8000-000000000003');
SELECT public.fixture_capture_visibility('after_revert', 'master_s', '40000000-0000-4000-8000-000000000004');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $visibility_equivalence$
DECLARE
  v_drift text;
BEGIN
  SELECT string_agg(format('%s/%s/%s', actor_label, relname, row_id), ', ')
  INTO v_drift
  FROM (
    (SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'before'
     EXCEPT ALL
     SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'after_revert')
    UNION ALL
    (SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'after_revert'
     EXCEPT ALL
     SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe WHERE phase = 'before')
  ) AS drift;

  IF v_drift IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL: rollback did not restore what readers see: %', v_drift;
  END IF;
END
$visibility_equivalence$;

-- ===========================================================================
-- C. No user data was destroyed by the rollback
-- ===========================================================================

DO $rows_preserved$
BEGIN
  PERFORM public.fx_assert('every seeded row survived both drafts and both rollbacks',
    (SELECT count(*) FROM public.orders) = 4
    AND (SELECT count(*) FROM public.order_responses) = 2
    AND (SELECT count(*) FROM public.reviews) = 1
    AND (SELECT count(*) FROM public.users) = 5
    AND (SELECT count(*) FROM public.reports) = 1);

  -- The moderator decisions recorded in users.status are kept. Rolling back
  -- removes enforcement, not evidence.
  PERFORM public.fx_assert('the two suspensions are still recorded after rollback',
    (SELECT count(*) FROM public.users WHERE status = 'suspended') = 2);
  PERFORM public.fx_assert('the report resolution recorded by the moderator survived',
    (SELECT status FROM public.reports WHERE id = 'd0000000-0000-4000-8000-00000000000d') = 'resolved');
END
$rows_preserved$;

-- ===========================================================================
-- D. What the rollback costs, demonstrated rather than described
-- ===========================================================================
-- These are not "nice to have" assertions. They are the reason a rollback needs
-- an owner decision: after it, the two release-blocking gaps are open again.

SET ROLE authenticated;
SELECT public.fx_become('30000000-0000-4000-8000-000000000003');
SELECT public.fx_assert_allowed('AFTER ROLLBACK: a suspended user can publish again',
  $$INSERT INTO public.orders (id, client_id, l2_id, title, description)
    VALUES ('44444444-0000-4000-8000-000000000044', '30000000-0000-4000-8000-000000000003',
            'plumbing', 'Снова публикую', 'Текст')$$);
SELECT public.fx_assert_allowed('AFTER ROLLBACK: a suspended user can lift its own suspension again',
  $$UPDATE public.users SET status = 'active' WHERE id = '30000000-0000-4000-8000-000000000003'$$);
-- ...but privilege escalation stays closed, because that lock was never this
-- draft's to remove. This is the assertion that separates "rollback of a
-- feature" from "rollback of the security baseline".
SELECT public.fx_assert_denied('AFTER ROLLBACK: self-promotion is still blocked by migration 0130',
  $$UPDATE public.users SET is_admin = true WHERE id = '30000000-0000-4000-8000-000000000003'$$,
  'users.is_admin is managed by the database owner only');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DELETE FROM public.orders WHERE id = '44444444-0000-4000-8000-000000000044';
UPDATE public.users SET status = 'suspended'
 WHERE id = '30000000-0000-4000-8000-000000000003';

\echo 'REVERT OK: both rollbacks restore the baseline exactly — and reopen both gaps, as asserted'
