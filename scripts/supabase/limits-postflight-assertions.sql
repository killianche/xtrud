-- Behaviour assertions for the two publication drafts, run against the
-- live-derived fixture AFTER both forward drafts are applied:
--
--   supabase/migration-drafts/0131_order_publish_limit.sql   (gap Р4)
--   supabase/migration-drafts/0133_order_picked_master.sql   (gap Р1)
--
-- Everything a user could do is done as the role that user really is
-- (`authenticated` plus a JWT claim), never as the owner, so RLS and column
-- privileges are in force exactly as they are through PostgREST.
--
-- Three things are asserted about every rule: that it refuses what it must
-- refuse, that it still ALLOWS everything the published client does today, and
-- that it refuses for the right reason (DETAIL is compared, not just failure).
--
-- scripts/supabase/limits-negative-controls.sql mutates the drafts and re-runs
-- this file; a mutation that stays green means the assertion below is decorative.

\set client_a  '10000000-0000-4000-8000-000000000001'
\set master_b  '20000000-0000-4000-8000-000000000002'
\set client_c  '30000000-0000-4000-8000-000000000003'
\set master_d  '40000000-0000-4000-8000-000000000004'
\set master_e  '50000000-0000-4000-8000-000000000005'
\set client_f  '60000000-0000-4000-8000-000000000006'
\set client_g  '70000000-0000-4000-8000-000000000007'

\echo '=== Р4 / 1. concurrency cap: three open orders per client ==='

SET ROLE authenticated;
SELECT public.fx_become(:'client_a');

SELECT public.fx_assert_allowed(
  'Р4: the first three open tasks are accepted',
  $$SELECT public.fx_publish('10000000-0000-4000-8000-000000000001', 3, 'Заявка А')$$
);
SELECT public.fx_assert('Р4: three open tasks exist', public.fx_open_count(:'client_a') = 3);
SELECT public.fx_assert('Р4: three accepted publications fanned out to three masters each',
                        public.fx_push_count() = 9);

SELECT public.fx_assert_denied(
  'Р4: the fourth open task is refused',
  $$INSERT INTO public.orders (client_id, l2_id, title, city_id, status)
    VALUES ('10000000-0000-4000-8000-000000000001', 'plumbing', 'Заявка А 4', 'nazran', 'open')$$,
  'active_order_limit_reached'
);
SELECT public.fx_assert('Р4: a refused publication notifies nobody', public.fx_push_count() = 9);

\echo '=== Р4 / 2. the cap is per account, not per platform ==='

SELECT public.fx_become(:'client_c');
SELECT public.fx_assert_allowed(
  'Р4: another client publishes while the first is at the cap',
  $$SELECT public.fx_publish('30000000-0000-4000-8000-000000000003', 1, 'Заявка В')$$
);
SELECT public.fx_assert('Р4: the second client has its own open task',
                        public.fx_open_count(:'client_c') = 1);

\echo '=== Р4 / 3. a cap is not a cage: closing and editing stay open ==='

SELECT public.fx_become(:'client_a');
SELECT public.fx_assert_allowed(
  'Р4: a client at the cap can still close a task',
  $$UPDATE public.orders SET status = 'cancelled', cancel_reason = 'no_longer_needed'
     WHERE id = public.fx_order_id('10000000-0000-4000-8000-000000000001', 'Заявка А 1')$$
);
SELECT public.fx_assert('Р4: closing freed a slot', public.fx_open_count(:'client_a') = 2);

SELECT public.fx_assert_allowed(
  'Р4: the freed slot can be used',
  $$SELECT public.fx_publish('10000000-0000-4000-8000-000000000001', 1, 'Заявка А 5')$$
);
SELECT public.fx_assert('Р4: back at the cap', public.fx_open_count(:'client_a') = 3);

SELECT public.fx_assert_allowed(
  'Р4: editing an open task at the cap is untouched',
  $$UPDATE public.orders SET title = 'Заявка А 2 (правка)'
     WHERE id = public.fx_order_id('10000000-0000-4000-8000-000000000001', 'Заявка А 2')$$
);

\echo '=== Р4 / 4. the UPDATE path: reopen_order cannot walk around the cap ==='

-- reopen_order is SECURITY DEFINER with EXECUTE granted to authenticated and is
-- reachable as /rest/v1/rpc/reopen_order. An INSERT-only guard would be walked
-- around here.
SELECT public.fx_assert_denied(
  'Р4: a SECURITY DEFINER RPC cannot reopen a fourth task',
  $$SELECT public.reopen_order(public.fx_order_id('10000000-0000-4000-8000-000000000001', 'Заявка А 1'))$$,
  'active_order_limit_reached'
);

SELECT public.fx_assert_allowed(
  'Р4: close one task to make room',
  $$UPDATE public.orders SET status = 'cancelled', cancel_reason = 'no_longer_needed'
     WHERE id = public.fx_order_id('10000000-0000-4000-8000-000000000001', 'Заявка А 2 (правка)')$$
);
SELECT public.fx_assert_allowed(
  'Р4: with room, the same reopen succeeds',
  $$SELECT public.reopen_order(public.fx_order_id('10000000-0000-4000-8000-000000000001', 'Заявка А 1'))$$
);
SELECT public.fx_assert('Р4: reopen restored exactly one open task',
                        public.fx_open_count(:'client_a') = 3);

\echo '=== Р4 / 5. server paths with no JWT identity are not capped ==='

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- cron, service_role, migrations and pg_restore all arrive with auth.uid() NULL.
-- If they were capped, restoring the production dump would fail on its own data.
SELECT public.fx_assert_allowed(
  'Р4: a server path inserts a fourth open task for a capped client',
  $$INSERT INTO public.orders (client_id, l2_id, title, city_id, status)
    VALUES ('10000000-0000-4000-8000-000000000001', 'plumbing', 'Восстановленная', 'nazran', 'open')$$
);
SELECT public.fx_assert('Р4: the server path really wrote a fourth open task',
                        public.fx_open_count(:'client_a') = 4);

\echo '=== Р4 / 6. rate cap: five new tasks per rolling 24 hours ==='

SET ROLE authenticated;
SELECT public.fx_become(:'client_f');

SELECT public.fx_assert_allowed(
  'Р4: three publications',
  $$SELECT public.fx_publish('60000000-0000-4000-8000-000000000006', 3, 'Заявка Е')$$
);
SELECT public.fx_assert_allowed(
  'Р4: close all three so the concurrency cap is out of the way',
  $$UPDATE public.orders SET status = 'cancelled', cancel_reason = 'no_longer_needed'
     WHERE client_id = '60000000-0000-4000-8000-000000000006' AND status = 'open'$$
);
SELECT public.fx_assert('Р4: nothing of this client is open', public.fx_open_count(:'client_f') = 0);

SELECT public.fx_assert_allowed(
  'Р4: publications four and five',
  $$SELECT public.fx_publish('60000000-0000-4000-8000-000000000006', 2, 'Заявка Е+')$$
);

-- Zero open tasks, so this refusal can only be the rate cap.
SELECT public.fx_assert_denied(
  'Р4: the sixth task in 24 hours is refused although nothing is open',
  $$INSERT INTO public.orders (client_id, l2_id, title, city_id, status)
    VALUES ('60000000-0000-4000-8000-000000000006', 'plumbing', 'Заявка Е 6', 'nazran', 'open')$$,
  'daily_order_limit_reached'
);

-- A task created as a draft is still a task created. Otherwise the cap is
-- avoided by inserting drafts and flipping them.
SELECT public.fx_assert_denied(
  'Р4: creating it as a draft does not avoid the rate cap',
  $$INSERT INTO public.orders (client_id, l2_id, title, city_id, status)
    VALUES ('60000000-0000-4000-8000-000000000006', 'plumbing', 'Заявка Е 6', 'nazran', 'draft')$$,
  'daily_order_limit_reached'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- The window is rolling, not a calendar day: yesterday's tasks stop counting.
UPDATE public.orders SET created_at = now() - interval '25 hours'
WHERE client_id = '60000000-0000-4000-8000-000000000006';

SET ROLE authenticated;
SELECT public.fx_become(:'client_f');
SELECT public.fx_assert_allowed(
  'Р4: once the 24-hour window has passed, publishing resumes',
  $$SELECT public.fx_publish('60000000-0000-4000-8000-000000000006', 1, 'Заявка Е завтра')$$
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

\echo '=== Р4 / 7. the counts are race-free, not merely correct ==='

-- use-order-publish-capacity.ts says race-free enforcement is still owed. The
-- guard takes a transaction-scoped advisory lock keyed on the client before it
-- counts, so two devices publishing at once queue instead of both reading a
-- stale count. Proven by observing the lock, and by observing its absence on a
-- path that must not take it.
BEGIN;
SET ROLE authenticated;
SELECT public.fx_become(:'client_f');
SELECT public.fx_assert('Р4: no advisory lock is held at the start of the transaction',
                        public.fx_holds_advisory_lock() = false);
SELECT public.fx_assert_allowed(
  'Р4: closing a task takes no publication lock',
  $$UPDATE public.orders SET status = 'cancelled', cancel_reason = 'no_longer_needed'
     WHERE id = public.fx_order_id('60000000-0000-4000-8000-000000000006', 'Заявка Е завтра 1')$$
);
SELECT public.fx_assert('Р4: closing really took no lock',
                        public.fx_holds_advisory_lock() = false);
SELECT public.fx_assert_allowed(
  'Р4: publishing succeeds inside the transaction',
  $$SELECT public.fx_publish('60000000-0000-4000-8000-000000000006', 1, 'Гонка')$$
);
SELECT public.fx_assert('Р4: publishing serialised this client through an advisory lock',
                        public.fx_holds_advisory_lock());
RESET ROLE;
ROLLBACK;
SELECT set_config('request.jwt.claim.sub', '', false);

\echo '=== Р1 / 1. setting up a task with real responses ==='

SET ROLE authenticated;
SELECT public.fx_become(:'client_g');
SELECT public.fx_assert_allowed(
  'Р1: the client publishes three tasks',
  $$SELECT public.fx_publish('70000000-0000-4000-8000-000000000007', 3, 'Задача Ж')$$
);

SELECT public.fx_become(:'master_b');
SELECT public.fx_assert_allowed(
  'Р1: master B responds to task 1',
  $$INSERT INTO public.order_responses (order_id, master_id, l2_id, message)
    VALUES (public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1'),
            '20000000-0000-4000-8000-000000000002', 'plumbing', 'Приеду сегодня')$$
);
SELECT public.fx_become(:'master_d');
SELECT public.fx_assert_allowed(
  'Р1: master D responds to task 1',
  $$INSERT INTO public.order_responses (order_id, master_id, l2_id, message)
    VALUES (public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1'),
            '40000000-0000-4000-8000-000000000004', 'plumbing', 'Сделаю дешевле')$$
);

\echo '=== Р1 / 2. what the anchor refuses ==='

SELECT public.fx_become(:'client_g');

SELECT public.fx_assert_denied(
  'Р1: a master who never responded cannot be named',
  $$UPDATE public.orders
       SET status = 'cancelled', cancel_reason = 'found_master',
           picked_master_id = '50000000-0000-4000-8000-000000000005'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1')$$,
  'picked_master_must_have_responded'
);

SELECT public.fx_assert_denied(
  'Р1: naming somebody while closing as "больше не нужно" is refused',
  $$UPDATE public.orders
       SET status = 'cancelled', cancel_reason = 'no_longer_needed',
           picked_master_id = '20000000-0000-4000-8000-000000000002'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1')$$,
  'picked_master_requires_found_master'
);

SELECT public.fx_assert_denied(
  'Р1: naming somebody on a task that stays open is refused',
  $$UPDATE public.orders SET picked_master_id = '20000000-0000-4000-8000-000000000002'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1')$$,
  'picked_master_requires_closed_order'
);

SELECT public.fx_assert_denied(
  'Р1: a task cannot be created with an executor already chosen',
  $$INSERT INTO public.orders (client_id, l2_id, title, city_id, status, cancel_reason, picked_master_id)
    VALUES ('70000000-0000-4000-8000-000000000007', 'plumbing', 'Сразу с мастером', 'nazran',
            'cancelled', 'found_master', '20000000-0000-4000-8000-000000000002')$$,
  'picked_master_set_on_create'
);

\echo '=== Р1 / 3. what the anchor allows, and what it tells the chosen master ==='

SELECT public.fx_reset_pushes();
SELECT public.fx_assert_allowed(
  'Р1: closing as "нашёл исполнителя" and naming a real responder',
  $$UPDATE public.orders
       SET status = 'cancelled', cancel_reason = 'found_master',
           picked_master_id = '20000000-0000-4000-8000-000000000002'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1')$$
);

SELECT public.fx_assert(
  'Р1: the anchor is stored',
  public.fx_order_field(public.fx_order_id(:'client_g', 'Задача Ж 1'), 'picked_master_id') = :'master_b'
);
-- The client never sent picked_at. Evidence a caller can write is not evidence.
SELECT public.fx_assert(
  'Р1: the server stamped picked_at itself',
  public.fx_order_field(public.fx_order_id(:'client_g', 'Задача Ж 1'), 'picked_at') IS NOT NULL
);
SELECT public.fx_assert(
  'Р1: the chosen master is notified exactly once',
  public.fx_push_count_for(:'master_b') = 1
);
SELECT public.fx_assert(
  'Р1: and is told they were chosen, not that the client cancelled',
  public.fx_last_push_title(:'master_b') = 'Клиент выбрал вас'
);
SELECT public.fx_assert(
  'Р1: the other responder is notified once, in the old wording',
  public.fx_push_count_for(:'master_d') = 1
  AND public.fx_last_push_title(:'master_d') = 'Клиент отменил заказ'
);
SELECT public.fx_assert('Р1: two responders, two pushes, no duplicate',
                        public.fx_push_count() = 2);

\echo '=== Р1 / 4. the anchor is final ==='

SELECT public.fx_assert_denied(
  'Р1: the chosen executor cannot be swapped afterwards',
  $$UPDATE public.orders SET picked_master_id = '40000000-0000-4000-8000-000000000004'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1')$$,
  'picked_master_is_final'
);
SELECT public.fx_assert_denied(
  'Р1: nor quietly erased while the task stays closed',
  $$UPDATE public.orders SET picked_master_id = NULL
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1')$$,
  'picked_master_is_final'
);

-- Re-opening the task is the one legitimate way back, and the published client's
-- "Открыть заново" button must keep working.
SELECT public.fx_assert_allowed(
  'Р1: reopening the task clears the anchor',
  $$SELECT public.reopen_order(public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1'))$$
);
SELECT public.fx_assert(
  'Р1: after reopening there is no chosen executor',
  public.fx_order_field(public.fx_order_id(:'client_g', 'Задача Ж 1'), 'picked_master_id') IS NULL
  AND public.fx_order_field(public.fx_order_id(:'client_g', 'Задача Ж 1'), 'picked_at') IS NULL
);

\echo '=== Р1 / 5. the published client keeps working unchanged ==='

-- use-cancel-order.ts sends status and cancel_reason and nothing else. That must
-- stay valid: naming an executor is optional, not required.
SELECT public.fx_assert_allowed(
  'Р1: closing as "нашёл исполнителя" without naming anybody is still valid',
  $$UPDATE public.orders SET status = 'cancelled', cancel_reason = 'found_master'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 2')$$
);
SELECT public.fx_assert(
  'Р1: and leaves no anchor behind',
  public.fx_order_field(public.fx_order_id(:'client_g', 'Задача Ж 2'), 'picked_master_id') IS NULL
);

\echo '=== Р1 / 6. SECURITY DEFINER is not a way around it ==='

-- confirm_work_done is live, SECURITY DEFINER, granted to authenticated, and
-- stamps picked_master_id through an UPDATE no RLS policy inspects. Before the
-- draft the preflight demonstrated it succeeding on a master who never responded.
SELECT public.fx_assert_denied(
  'Р1: the live SECURITY DEFINER RPC can no longer stamp an executor',
  $$SELECT public.confirm_work_done_fixture(
      '50000000-0000-4000-8000-000000000005',
      public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 3'))$$,
  'picked_master_requires_closed_order'
);

\echo '=== Р1 / 7. the owner cannot name themselves, because they cannot respond ==='

-- No separate self-pick rule exists in the draft. This is the proof that none is
-- needed: the live not-self trigger makes an owner response impossible, and the
-- responder requirement then excludes the owner automatically.
SELECT public.fx_assert_denied(
  'Р1: a client cannot respond to their own task',
  $$INSERT INTO public.order_responses (order_id, master_id, l2_id, message)
    VALUES (public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 3'),
            '70000000-0000-4000-8000-000000000007', 'plumbing', 'Сам себе')$$,
  NULL
);
SELECT public.fx_assert_denied(
  'Р1: and therefore cannot name themselves as the executor',
  $$UPDATE public.orders
       SET status = 'cancelled', cancel_reason = 'found_master',
           picked_master_id = '70000000-0000-4000-8000-000000000007'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 3')$$,
  'picked_master_must_have_responded'
);

\echo '=== Р1 / 8. a master cannot name themselves either ==='

SELECT public.fx_become(:'master_b');
-- RLS gives this UPDATE no rows rather than an error, so the assertion is about
-- the stored value, not about an exception.
SELECT public.fx_assert_allowed(
  'Р1: a master may attempt the update',
  $$UPDATE public.orders SET picked_master_id = '20000000-0000-4000-8000-000000000002'
     WHERE id = public.fx_order_id('70000000-0000-4000-8000-000000000007', 'Задача Ж 1')$$
);
SELECT public.fx_assert(
  'Р1: but nothing was written',
  public.fx_order_field(public.fx_order_id(:'client_g', 'Задача Ж 1'), 'picked_master_id') IS NULL
);

\echo '=== Р1 / 9. legacy rows stay writable ==='

-- Live holds rows this contract would reject as transitions: two cancelled
-- orders closed as stale_no_activity_30d that carry a picked master, one of whom
-- never responded. The guard checks transitions, never the resting state, so
-- those rows must remain ordinary editable history.
SELECT public.fx_become(:'client_a');
SELECT public.fx_assert_allowed(
  'Р1: a legacy cancelled order with a picked master is still editable',
  $$UPDATE public.orders SET title = 'Легаси протухший (правка)'
     WHERE id = 'aa000000-0000-4000-8000-0000000000a2'$$
);
SELECT public.fx_assert_allowed(
  'Р1: a legacy completed order with a picked master is still editable',
  $$UPDATE public.orders SET title = 'Легаси завершённый (правка)'
     WHERE id = 'aa000000-0000-4000-8000-0000000000a1'$$
);
SELECT public.fx_assert(
  'Р1: the legacy anchors were not disturbed',
  public.fx_order_field('aa000000-0000-4000-8000-0000000000a2', 'picked_master_id') = :'master_e'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

\echo '=== inertness: neither draft may widen the surface it did not own ==='

DO $inert$
DECLARE
  v_diff int;
BEGIN
  -- 1. Not one policy added, dropped, renamed or rewritten.
  -- Symmetric difference, computed as two explicitly parenthesised halves. A
  -- single chained EXCEPT ... UNION ALL ... EXCEPT associates left to right and
  -- silently stops detecting added policies; the negative control
  -- `sneak_in_an_orders_policy` exists to keep that mistake from coming back.
  SELECT (
    SELECT count(*) FROM (
      SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = 'public'
      EXCEPT
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM public.fixture_policy_baseline
    ) AS added
  ) + (
    SELECT count(*) FROM (
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM public.fixture_policy_baseline
      EXCEPT
      SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = 'public'
    ) AS removed
  ) INTO v_diff;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL [inertness]: the drafts changed % policy row(s)', v_diff;
  END IF;

  -- 2. Both guards return `trigger`. PostgREST cannot expose such a function as
  -- /rest/v1/rpc/<name>, so neither is reachable from outside by construction.
  IF EXISTS (
    SELECT 1 FROM pg_proc AS proc_row
    JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
    WHERE schema_row.nspname = 'public'
      AND proc_row.proname IN ('guard_order_publication_limit', 'guard_order_picked_master')
      AND proc_row.prorettype <> 'pg_catalog.trigger'::regtype
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL [inertness]: a guard does not return trigger and could be exposed as an RPC';
  END IF;

  -- 3. And EXECUTE is revoked from every API role on top of that.
  IF has_function_privilege('anon',          'public.guard_order_publication_limit()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_order_publication_limit()', 'EXECUTE')
     OR has_function_privilege('service_role',  'public.guard_order_publication_limit()', 'EXECUTE')
     OR has_function_privilege('anon',          'public.guard_order_picked_master()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_order_picked_master()', 'EXECUTE')
     OR has_function_privilege('service_role',  'public.guard_order_picked_master()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAIL [inertness]: an API role can EXECUTE a guard function directly';
  END IF;

  -- 4. Both triggers exist on public.orders and point at their own function.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
      AND tgname = 'orders_publication_limit_guard'
      AND tgfoid = to_regprocedure('public.guard_order_publication_limit()')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
      AND tgname = 'orders_picked_master_guard'
      AND tgfoid = to_regprocedure('public.guard_order_picked_master()')
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL [inertness]: a guard trigger is missing or points elsewhere';
  END IF;

  -- 5. Every trigger that existed before both drafts still exists.
  IF EXISTS (
    SELECT 1 FROM public.fixture_trigger_baseline AS baseline
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
        AND tgname = baseline.tgname
    )
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL [inertness]: a pre-existing trigger on public.orders disappeared';
  END IF;

  -- 6. 0133 replaces exactly one live function and leaves the others alone.
  IF (SELECT md5(prosrc) FROM pg_proc AS proc_row
      JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
      WHERE schema_row.nspname = 'public'
        AND proc_row.proname = 'trg_notify_order_cancelled_or_expired')
     = (SELECT prosrc_md5 FROM public.fixture_function_baseline
        WHERE proname = 'trg_notify_order_cancelled_or_expired') THEN
    RAISE EXCEPTION 'ASSERT FAIL [inertness]: 0133 did not actually replace the notification function';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fixture_function_baseline AS baseline
    JOIN pg_proc AS proc_row ON proc_row.proname = baseline.proname
    JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
    WHERE schema_row.nspname = 'public'
      AND baseline.proname IN ('trg_notify_masters_on_new_order', 'reopen_order')
      AND md5(proc_row.prosrc) IS DISTINCT FROM baseline.prosrc_md5
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL [inertness]: a live function the drafts do not own was rewritten';
  END IF;
END
$inert$;

-- A direct call is refused for both roles that could try one.
SET ROLE authenticated;
SELECT public.fx_assert_denied(
  'inertness: authenticated cannot call the publication guard directly',
  $$SELECT public.guard_order_publication_limit()$$, NULL);
SELECT public.fx_assert_denied(
  'inertness: authenticated cannot call the picked-master guard directly',
  $$SELECT public.guard_order_picked_master()$$, NULL);
RESET ROLE;

SET ROLE anon;
SELECT public.fx_assert_denied(
  'inertness: anon cannot call the publication guard directly',
  $$SELECT public.guard_order_publication_limit()$$, NULL);
RESET ROLE;

\echo 'POSTFLIGHT OK: gap Р4 and gap Р1 behave as specified, and nothing else moved'
