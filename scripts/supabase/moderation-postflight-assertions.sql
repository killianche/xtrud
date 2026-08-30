-- Behaviour assertions for
--   supabase/migration-drafts/0126_suspension_enforcement.sql  (gap Р3)
--   supabase/migration-drafts/0128_order_moderation.sql        (gap Р5)
-- executed against the synthetic current-state fixture in
-- scripts/supabase/moderation-preflight-fixture.sql.
--
-- Passing proves the drafts' internal contract. It is NOT production approval:
-- see supabase/migration-drafts/README.md.
--
-- Every assertion here is checked for its ability to FAIL by
-- scripts/supabase/moderation-negative-controls.sql, which mutates the drafts
-- and requires this file to reject the mutation. An assertion that cannot fail
-- is not a test, it is a comment — that lesson comes from the user-blocking
-- work, where a green fixture froze a HIGH-severity hole into a contract.

\set ON_ERROR_STOP on

-- ===========================================================================
-- A. Structure and reachable surface
-- ===========================================================================

DO $structure$
BEGIN
  PERFORM public.fx_assert('0126: content guard function exists',
    to_regprocedure('public.guard_content_author_active()') IS NOT NULL);
  PERFORM public.fx_assert('0126: users privilege guard function exists',
    to_regprocedure('public.guard_user_privilege_columns()') IS NOT NULL);
  PERFORM public.fx_assert('0128: order moderation guard function exists',
    to_regprocedure('public.guard_order_moderation_columns()') IS NOT NULL);
  PERFORM public.fx_assert('0128: response target guard function exists',
    to_regprocedure('public.guard_response_target_not_hidden()') IS NOT NULL);
  PERFORM public.fx_assert('0128: moderator RPC exists',
    to_regprocedure('public.admin_set_order_hidden(uuid, boolean)') IS NOT NULL);

  -- Every guard is attached. A function without its trigger protects nothing.
  PERFORM public.fx_assert('0126: orders trigger attached and enabled', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'orders' AND t.tgname = 'orders_author_active_guard'
      AND NOT t.tgisinternal AND t.tgenabled <> 'D'));
  PERFORM public.fx_assert('0126: order_responses trigger attached and enabled', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'order_responses' AND t.tgname = 'order_responses_author_active_guard'
      AND NOT t.tgisinternal AND t.tgenabled <> 'D'));
  PERFORM public.fx_assert('0126: reviews trigger attached and enabled', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'reviews' AND t.tgname = 'reviews_author_active_guard'
      AND NOT t.tgisinternal AND t.tgenabled <> 'D'));
  PERFORM public.fx_assert('0126: users trigger attached and enabled', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'users' AND t.tgname = 'users_privilege_columns_guard'
      AND NOT t.tgisinternal AND t.tgenabled <> 'D'));
  PERFORM public.fx_assert('0128: orders moderation trigger attached and enabled', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'orders' AND t.tgname = 'orders_moderation_columns_guard'
      AND NOT t.tgisinternal AND t.tgenabled <> 'D'));
  PERFORM public.fx_assert('0128: response hidden-order trigger attached and enabled', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'order_responses' AND t.tgname = 'order_responses_hidden_order_guard'
      AND NOT t.tgisinternal AND t.tgenabled <> 'D'));

  -- The content guard MUST bypass row level security, otherwise the status
  -- lookup depends on a policy set these drafts do not own.
  PERFORM public.fx_assert('0126: content guard reads status with row_security off', EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.guard_content_author_active()')
      AND prosecdef
      AND 'row_security=off' = ANY (proconfig)));

  -- The response guard MUST bypass row level security: under the caller's own
  -- RLS the hidden order is invisible and the guard would fail OPEN.
  PERFORM public.fx_assert('0128: response guard reads orders with row_security off', EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.guard_response_target_not_hidden()')
      AND prosecdef
      AND 'row_security=off' = ANY (proconfig)));

  -- The two role-sensitive guards MUST NOT be SECURITY DEFINER: inside a
  -- definer function current_user is the owner, and the "API client vs server
  -- path" distinction they are built on would silently always say "server".
  PERFORM public.fx_assert('0126: users privilege guard is SECURITY INVOKER', EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.guard_user_privilege_columns()')
      AND NOT prosecdef));
  PERFORM public.fx_assert('0128: order moderation guard is SECURITY INVOKER', EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.guard_order_moderation_columns()')
      AND NOT prosecdef));

  -- PostgREST publishes every function of an exposed schema as
  -- /rest/v1/rpc/<name>. The guards must not be callable by an API role, and
  -- they must return `trigger`, which PostgREST cannot map to a request at all.
  PERFORM public.fx_assert('no API role may execute the content guard',
    NOT has_function_privilege('anon', 'public.guard_content_author_active()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.guard_content_author_active()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.guard_content_author_active()', 'EXECUTE'));
  PERFORM public.fx_assert('no API role may execute the users privilege guard',
    NOT has_function_privilege('anon', 'public.guard_user_privilege_columns()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.guard_user_privilege_columns()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.guard_user_privilege_columns()', 'EXECUTE'));
  PERFORM public.fx_assert('no API role may execute the order moderation guard',
    NOT has_function_privilege('anon', 'public.guard_order_moderation_columns()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.guard_order_moderation_columns()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.guard_order_moderation_columns()', 'EXECUTE'));
  PERFORM public.fx_assert('no API role may execute the response target guard',
    NOT has_function_privilege('anon', 'public.guard_response_target_not_hidden()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.guard_response_target_not_hidden()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.guard_response_target_not_hidden()', 'EXECUTE'));
  PERFORM public.fx_assert('every guard returns trigger and is therefore not callable over HTTP', (
    SELECT bool_and(prorettype = 'pg_catalog.trigger'::regtype)
    FROM pg_proc WHERE oid IN (
      to_regprocedure('public.guard_content_author_active()'),
      to_regprocedure('public.guard_user_privilege_columns()'),
      to_regprocedure('public.guard_order_moderation_columns()'),
      to_regprocedure('public.guard_response_target_not_hidden()'))));

  -- The moderator RPC is meant to be reachable over HTTP by signed-in callers
  -- and by nobody else. It self-checks; that is asserted behaviourally below.
  PERFORM public.fx_assert('anonymous callers cannot execute the moderator RPC',
    NOT has_function_privilege('anon', 'public.admin_set_order_hidden(uuid, boolean)', 'EXECUTE'));
  PERFORM public.fx_assert('signed-in callers can execute the moderator RPC',
    has_function_privilege('authenticated', 'public.admin_set_order_hidden(uuid, boolean)', 'EXECUTE'));

  -- 0128 columns.
  PERFORM public.fx_assert('0128: moderation columns exist and are nullable', (
    SELECT count(*) = 2 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name IN ('moderation_hidden_at', 'moderation_hidden_by')
      AND is_nullable = 'YES'));

  -- The RESTRICTIVE policies must be RESTRICTIVE. A PERMISSIVE policy of the
  -- same text would WIDEN visibility instead of narrowing it.
  PERFORM public.fx_assert('0128: hidden-order policies are RESTRICTIVE', (
    SELECT count(*) = 2 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname IN ('orders_moderation_hidden_anon_restrictive',
                         'orders_moderation_hidden_auth_restrictive')
      AND permissive = 'RESTRICTIVE' AND cmd = 'SELECT'));
  PERFORM public.fx_assert('0128: admin read policy is PERMISSIVE SELECT', EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'orders_admin_select'
      AND permissive = 'PERMISSIVE' AND cmd = 'SELECT'));
END
$structure$;

-- Existing policies must be untouched. The drafts add; they never rewrite a
-- policy an applied migration owns.
DO $baseline_untouched$
DECLARE
  v_drift text;
BEGIN
  SELECT string_agg(format('%s.%s', b.tablename, b.policyname), ', ')
  INTO v_drift
  FROM public.fixture_policy_baseline AS b
  LEFT JOIN pg_policies AS p
    ON p.schemaname = b.schemaname AND p.tablename = b.tablename
   AND p.policyname = b.policyname
  WHERE p.policyname IS NULL
     OR p.permissive IS DISTINCT FROM b.permissive
     OR p.roles::text IS DISTINCT FROM b.roles
     OR p.cmd IS DISTINCT FROM b.cmd
     OR p.qual IS DISTINCT FROM b.qual
     OR p.with_check IS DISTINCT FROM b.with_check;

  IF v_drift IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL: the drafts changed pre-existing policies: %', v_drift;
  END IF;
END
$baseline_untouched$;

-- ===========================================================================
-- B. Inertness at apply time
-- ===========================================================================
-- Nobody is suspended and nothing is hidden yet, so every reader except a
-- moderator must see exactly what they saw before. A migration that quietly
-- changes what the published client can read is a breaking change no matter
-- what its intent was.

SET ROLE anon;
SELECT public.fixture_capture_visibility('after_apply', 'anon', NULL);
RESET ROLE;

SET ROLE authenticated;
SELECT public.fixture_capture_visibility('after_apply', 'admin_m',  'f0000000-0000-4000-8000-00000000000f');
SELECT public.fixture_capture_visibility('after_apply', 'client_a', '10000000-0000-4000-8000-000000000001');
SELECT public.fixture_capture_visibility('after_apply', 'master_b', '20000000-0000-4000-8000-000000000002');
SELECT public.fixture_capture_visibility('after_apply', 'client_s', '30000000-0000-4000-8000-000000000003');
SELECT public.fixture_capture_visibility('after_apply', 'master_s', '40000000-0000-4000-8000-000000000004');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $inertness$
DECLARE
  v_drift text;
BEGIN
  SELECT string_agg(format('%s/%s/%s', actor_label, relname, row_id), ', ')
  INTO v_drift
  FROM (
    (SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'before' AND actor_label <> 'admin_m'
     EXCEPT ALL
     SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'after_apply' AND actor_label <> 'admin_m')
    UNION ALL
    (SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'after_apply' AND actor_label <> 'admin_m'
     EXCEPT ALL
     SELECT actor_label, relname, row_id FROM public.fixture_visibility_probe
      WHERE phase = 'before' AND actor_label <> 'admin_m')
  ) AS drift;

  IF v_drift IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL: applying the drafts changed what an ordinary reader sees: %', v_drift;
  END IF;
END
$inertness$;

-- The moderator is the one reader who gains, and gains exactly one thing: the
-- cancelled order, which orders_read_open_or_own shows only to participants.
DO $moderator_gain$
DECLARE
  v_gained uuid[];
BEGIN
  SELECT array_agg(row_id ORDER BY row_id) INTO v_gained
  FROM (
    SELECT row_id FROM public.fixture_visibility_probe
     WHERE phase = 'after_apply' AND actor_label = 'admin_m' AND relname = 'orders'
    EXCEPT
    SELECT row_id FROM public.fixture_visibility_probe
     WHERE phase = 'before' AND actor_label = 'admin_m' AND relname = 'orders'
  ) AS gained;

  PERFORM public.fx_assert(
    '0128: the moderator gains exactly the cancelled order and nothing else',
    v_gained = ARRAY['80000000-0000-4000-8000-000000000008'::uuid]);
END
$moderator_gain$;

-- ===========================================================================
-- C. Positive control — an active account is untouched
-- ===========================================================================
-- Without this section a draft that denies everything would score full marks.

SET ROLE authenticated;
SELECT public.fx_become('10000000-0000-4000-8000-000000000001');
SELECT public.fx_assert_allowed('active client publishes a task',
  $$INSERT INTO public.orders (id, client_id, l2_id, title, description)
    VALUES ('11111111-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'plumbing', 'Новая заявка', 'Текст')$$);
SELECT public.fx_assert_allowed('active client edits the text of its own task',
  $$UPDATE public.orders SET title = 'Новая заявка 2', description = 'Другой текст'
     WHERE id = '11111111-0000-4000-8000-000000000011'$$);

SELECT public.fx_become('20000000-0000-4000-8000-000000000002');
SELECT public.fx_assert_allowed('active master responds',
  $$INSERT INTO public.order_responses (id, order_id, master_id, l2_id, message)
    VALUES ('22222222-0000-4000-8000-000000000022', '11111111-0000-4000-8000-000000000011',
            '20000000-0000-4000-8000-000000000002', 'plumbing', 'Готов взяться')$$);
SELECT public.fx_assert_allowed('active master edits its own response text',
  $$UPDATE public.order_responses SET message = 'Готов взяться сегодня'
     WHERE id = '22222222-0000-4000-8000-000000000022'$$);
SELECT public.fx_assert_allowed('active user leaves a freeform review through the definer RPC',
  $$SELECT public.submit_master_review_fixture('40000000-0000-4000-8000-000000000004', 5, 'Отлично')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- ===========================================================================
-- D. Gap Р3 — a suspension that suspends
-- ===========================================================================

-- D1. The moderator suspends through the ordinary PostgREST write path the
-- published admin screen already uses (src/features/admin/use-admin.ts).
SET ROLE authenticated;
SELECT public.fx_become('f0000000-0000-4000-8000-00000000000f');
SELECT public.fx_assert_allowed('moderator suspends a client',
  $$UPDATE public.users SET status = 'suspended' WHERE id = '30000000-0000-4000-8000-000000000003'$$);
SELECT public.fx_assert_allowed('moderator suspends a master',
  $$UPDATE public.users SET status = 'suspended' WHERE id = '40000000-0000-4000-8000-000000000004'$$);

-- Even a moderator may not mint another moderator from the client. That is the
-- "один админ молча создаёт других" finding in docs/ADMIN_PANEL.md §2.
SELECT public.fx_assert_denied('moderator cannot create another moderator from the app',
  $$UPDATE public.users SET is_admin = true WHERE id = '10000000-0000-4000-8000-000000000001'$$,
  'is_admin_is_server_managed');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $suspended$
BEGIN
  PERFORM public.fx_assert('the suspension is stored',
    (SELECT count(*) FROM public.users WHERE status = 'suspended') = 2);
  PERFORM public.fx_assert('no moderator was created',
    (SELECT count(*) FROM public.users WHERE is_admin) = 1);
END
$suspended$;

-- D2. The sanction cannot be lifted by the sanctioned.
SET ROLE authenticated;
SELECT public.fx_become('30000000-0000-4000-8000-000000000003');
SELECT public.fx_assert_denied('a suspended user cannot un-suspend itself',
  $$UPDATE public.users SET status = 'active' WHERE id = '30000000-0000-4000-8000-000000000003'$$,
  'user_status_is_moderator_managed');
SELECT public.fx_assert_denied('a suspended user cannot promote itself to moderator',
  $$UPDATE public.users SET is_admin = true WHERE id = '30000000-0000-4000-8000-000000000003'$$,
  'is_admin_is_server_managed');
-- The same write with no WHERE clause: an UPDATE that reads no column never
-- evaluates a SELECT policy, so this path must be closed by the trigger and not
-- by visibility.
SELECT public.fx_assert_denied('a suspended user cannot un-suspend itself with an unqualified UPDATE',
  $$UPDATE public.users SET status = 'active'$$,
  'user_status_is_moderator_managed');
-- users_insert_own lets a client create its own row. Creating it pre-promoted
-- would be a second way in, so the INSERT is normalised rather than refused —
-- refusing it would break account bootstrap for a real client.
SELECT public.fx_become('99999999-0000-4000-8000-000000000099');
SELECT public.fx_assert_allowed('a client may still insert its own users row',
  $$INSERT INTO public.users (id, first_name, is_admin, status)
    VALUES ('99999999-0000-4000-8000-000000000099', 'Подставной', true, 'suspended')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $insert_normalised$
BEGIN
  PERFORM public.fx_assert('a self-inserted row can never arrive pre-promoted or pre-cleared',
    (SELECT NOT is_admin AND status = 'active' FROM public.users
      WHERE id = '99999999-0000-4000-8000-000000000099'));
  PERFORM public.fx_assert('still exactly one moderator',
    (SELECT count(*) FROM public.users WHERE is_admin) = 1);
  DELETE FROM public.users WHERE id = '99999999-0000-4000-8000-000000000099';
END
$insert_normalised$;

-- D3. No new content from a suspended account, on every path there is.
SET ROLE authenticated;
SELECT public.fx_become('30000000-0000-4000-8000-000000000003');
SELECT public.fx_assert_denied('a suspended client cannot publish a task',
  $$INSERT INTO public.orders (client_id, l2_id, title, description)
    VALUES ('30000000-0000-4000-8000-000000000003', 'plumbing', 'Ещё одна', 'Текст')$$,
  'account_not_active');

-- THE ORACLE TEST. submit_master_review_fixture is SECURITY DEFINER and runs as
-- the table owner, so public.reviews RLS does not apply to it. This is the path
-- the CURRENT product actually uses for reviews, and an RLS-only fix for Р3
-- would let it straight through.
SELECT public.fx_assert_denied('a suspended user cannot review through the RLS-bypassing definer RPC',
  $$SELECT public.submit_master_review_fixture('20000000-0000-4000-8000-000000000002', 1, 'Плохо')$$,
  'account_not_active');

SELECT public.fx_become('40000000-0000-4000-8000-000000000004');
SELECT public.fx_assert_denied('a suspended master cannot respond',
  $$INSERT INTO public.order_responses (order_id, master_id, l2_id, message)
    VALUES ('11111111-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000004', 'plumbing', 'Возьмусь')$$,
  'account_not_active');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- D4. No edits to content already published. Without this the INSERT rule is
-- cosmetic: the same text is rewritten in place.
SET ROLE authenticated;
SELECT public.fx_become('30000000-0000-4000-8000-000000000003');
SELECT public.fx_assert_denied('a suspended client cannot rewrite the title of its live task',
  $$UPDATE public.orders SET title = 'Переписано' WHERE id = '60000000-0000-4000-8000-000000000006'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended client cannot rewrite the body of its live task',
  $$UPDATE public.orders SET description = 'Переписано' WHERE id = '60000000-0000-4000-8000-000000000006'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended client cannot attach new photos',
  $$UPDATE public.orders SET photo_urls = ARRAY['https://example.invalid/x.jpg']
     WHERE id = '60000000-0000-4000-8000-000000000006'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended client cannot rewrite the displayed contact name',
  $$UPDATE public.orders SET contact_name = 'Переписано' WHERE id = '60000000-0000-4000-8000-000000000006'$$,
  'account_not_active');
-- Relocation is republication. Walking the same listing through every category
-- and city changes not one character of its text and puts it in front of a new
-- audience each time.
SELECT public.fx_assert_denied('a suspended client cannot move its task to another category',
  $$UPDATE public.orders SET l2_id = 'electrics' WHERE id = '60000000-0000-4000-8000-000000000006'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended client cannot move its task to another city',
  $$UPDATE public.orders SET city_id = 'magas' WHERE id = '60000000-0000-4000-8000-000000000006'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended client cannot move its task to another district',
  $$UPDATE public.orders SET district = 'Центр' WHERE id = '60000000-0000-4000-8000-000000000006'$$,
  'account_not_active');
-- Unqualified UPDATE, same reason as above.
SELECT public.fx_assert_denied('a suspended client cannot rewrite titles with an unqualified UPDATE',
  $$UPDATE public.orders SET title = 'Переписано'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended user cannot rewrite the text of its own review',
  $$UPDATE public.reviews SET text = 'Переписано' WHERE id = 'c0000000-0000-4000-8000-00000000000c'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended user cannot change the rating it already gave',
  $$UPDATE public.reviews SET rating = 1 WHERE id = 'c0000000-0000-4000-8000-00000000000c'$$,
  'account_not_active');

SELECT public.fx_become('40000000-0000-4000-8000-000000000004');
SELECT public.fx_assert_denied('a suspended master cannot rewrite its response text',
  $$UPDATE public.order_responses SET message = 'Переписано'
     WHERE id = 'b0000000-0000-4000-8000-00000000000b'$$,
  'account_not_active');
SELECT public.fx_assert_denied('a suspended master cannot rewrite its promised lead time',
  $$UPDATE public.order_responses SET lead_time = 'Завтра'
     WHERE id = 'b0000000-0000-4000-8000-00000000000b'$$,
  'account_not_active');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $content_unchanged$
BEGIN
  PERFORM public.fx_assert('none of the denied edits landed',
    (SELECT title FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006') = 'Установить смеситель'
    AND (SELECT description FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006') = 'Ванная'
    AND (SELECT cardinality(photo_urls) FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006') = 0
    AND (SELECT l2_id FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006') = 'plumbing'
    AND (SELECT city_id FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006') = 'nazran'
    AND (SELECT text FROM public.reviews WHERE id = 'c0000000-0000-4000-8000-00000000000c') = 'Хороший мастер'
    AND (SELECT rating FROM public.reviews WHERE id = 'c0000000-0000-4000-8000-00000000000c') = 5
    AND (SELECT message FROM public.order_responses WHERE id = 'b0000000-0000-4000-8000-00000000000b') = 'Сделаю дешевле');
END
$content_unchanged$;

-- D5. A sanction is not an eviction. Everything below MUST still work.
SET ROLE authenticated;
SELECT public.fx_become('30000000-0000-4000-8000-000000000003');
SELECT public.fx_assert('a suspended user still reads its own task',
  (SELECT count(*) FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006') = 1);
-- Exactly the payload src/features/orders/use-cancel-order.ts sends.
SELECT public.fx_assert_allowed('a suspended user can still close its own task',
  $$UPDATE public.orders
       SET status = 'cancelled', cancel_reason = 'no_longer_needed',
           cancelled_by = '30000000-0000-4000-8000-000000000003'
     WHERE id = '60000000-0000-4000-8000-000000000006'$$);
SELECT public.fx_assert_allowed('a suspended user can still complain — the support channel stays open',
  $$INSERT INTO public.reports (reporter_id, target_type, target_id, reason, description)
    VALUES ('30000000-0000-4000-8000-000000000003', 'user',
            '20000000-0000-4000-8000-000000000002', 'safety', 'Жалоба от приостановленного')$$);
SELECT public.fx_assert_allowed('a suspended user can still edit its own identity fields',
  $$UPDATE public.users SET first_name = 'Клиент С.' WHERE id = '30000000-0000-4000-8000-000000000003'$$);
SELECT public.fx_assert_allowed('a suspended user can still delete its own closed task',
  $$DELETE FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006'$$);

SELECT public.fx_become('40000000-0000-4000-8000-000000000004');
SELECT public.fx_assert_allowed('a suspended master is not trapped: it can still withdraw its response',
  $$SELECT public.withdraw_response_fixture('b0000000-0000-4000-8000-00000000000b')$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $not_an_eviction$
BEGIN
  PERFORM public.fx_assert('the withdrawal actually happened',
    (SELECT status FROM public.order_responses WHERE id = 'b0000000-0000-4000-8000-00000000000b') = 'withdrawn');
  PERFORM public.fx_assert('the suspended user deleted its own task',
    NOT EXISTS (SELECT 1 FROM public.orders WHERE id = '60000000-0000-4000-8000-000000000006'));
END
$not_an_eviction$;

-- D6. Account deletion — an App Store requirement — must survive the status
-- lock, because delete_my_account sets users.status itself.
INSERT INTO public.users (id, first_name, status)
VALUES ('e0000000-0000-4000-8000-00000000000e', 'Клиент Д', 'suspended');

SET ROLE authenticated;
SELECT public.fx_become('e0000000-0000-4000-8000-00000000000e');
SELECT public.fx_assert_allowed('a suspended user can still delete their account',
  $$SELECT public.delete_my_account_fixture()$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $deletion_works$
BEGIN
  PERFORM public.fx_assert('account deletion set the status through the definer path',
    (SELECT status FROM public.users WHERE id = 'e0000000-0000-4000-8000-00000000000e') = 'deleted');
END
$deletion_works$;

DELETE FROM public.users WHERE id = 'e0000000-0000-4000-8000-00000000000e';

-- D7. Server paths without a JWT identity are not moderated actors.
SELECT public.fx_assert_allowed('the expiry cron still works on a suspended user''s tasks',
  $$SELECT public.expire_old_orders_fixture()$$);

-- Restore the statuses the cron just changed, so the rollback comparison later
-- measures the drafts and not this probe.
UPDATE public.orders SET status = 'open'
WHERE id IN ('50000000-0000-4000-8000-000000000005',
             '70000000-0000-4000-8000-000000000007',
             '11111111-0000-4000-8000-000000000011');

-- ===========================================================================
-- E. Gap Р5 — a report about a task has an action
-- ===========================================================================

-- E1. Authorisation is decided before existence, so a non-moderator learns
-- nothing about which order ids exist.
SET ROLE authenticated;
SELECT public.fx_become('10000000-0000-4000-8000-000000000001');
SELECT public.fx_assert_denied('an ordinary user cannot hide a task',
  $$SELECT public.admin_set_order_hidden('70000000-0000-4000-8000-000000000007', true)$$,
  'admin_required');
SELECT public.fx_assert_denied('an ordinary user gets the same answer for an id that does not exist',
  $$SELECT public.admin_set_order_hidden('00000000-0000-4000-8000-0000000000ff', true)$$,
  'admin_required');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- A suspended user is not a moderator either.
SET ROLE authenticated;
SELECT public.fx_become('30000000-0000-4000-8000-000000000003');
SELECT public.fx_assert_denied('a suspended user cannot hide a task',
  $$SELECT public.admin_set_order_hidden('70000000-0000-4000-8000-000000000007', true)$$,
  'admin_required');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- E2. The moderator hides the reported task.
SET ROLE authenticated;
SELECT public.fx_become('f0000000-0000-4000-8000-00000000000f');
SELECT public.fx_assert_allowed('a moderator hides the reported task',
  $$SELECT public.admin_set_order_hidden('70000000-0000-4000-8000-000000000007', true)$$);
SELECT public.fx_assert_denied('a moderator asking for an id that does not exist is told so',
  $$SELECT public.admin_set_order_hidden('00000000-0000-4000-8000-0000000000ff', true)$$,
  'order_not_found');
SELECT public.fx_assert_allowed('the moderator resolves the report with the existing admin policy',
  $$UPDATE public.reports SET status = 'resolved', admin_note = 'Задание скрыто',
      reviewed_by = 'f0000000-0000-4000-8000-00000000000f', reviewed_at = now()
     WHERE id = 'd0000000-0000-4000-8000-00000000000d'$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $hidden_recorded$
BEGIN
  PERFORM public.fx_assert('the hide is recorded with its author',
    (SELECT moderation_hidden_at IS NOT NULL
            AND moderation_hidden_by = 'f0000000-0000-4000-8000-00000000000f'
     FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'));
END
$hidden_recorded$;

-- E3. Hidden means invisible — to everyone except the owner and moderators.
SET ROLE anon;
SELECT public.fx_become(NULL);
SELECT public.fx_assert('a hidden task leaves the anonymous feed',
  NOT EXISTS (SELECT 1 FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'));
SELECT public.fx_assert('the anonymous feed is not empty — the policy narrows, it does not blank',
  public.fx_visible_orders() > 0);
RESET ROLE;

SET ROLE authenticated;
SELECT public.fx_become('20000000-0000-4000-8000-000000000002');
SELECT public.fx_assert('a hidden task leaves the signed-in feed',
  NOT EXISTS (SELECT 1 FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'));
SELECT public.fx_assert('other tasks are unaffected',
  EXISTS (SELECT 1 FROM public.orders WHERE id = '50000000-0000-4000-8000-000000000005'));

SELECT public.fx_become('10000000-0000-4000-8000-000000000001');
SELECT public.fx_assert('the owner still sees their own hidden task — moderation is not confiscation',
  EXISTS (SELECT 1 FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'));

SELECT public.fx_become('f0000000-0000-4000-8000-00000000000f');
SELECT public.fx_assert('a moderator sees the hidden task in order to review the decision',
  EXISTS (SELECT 1 FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'));
SELECT public.fx_assert('a moderator can read the subject of a report in any status',
  EXISTS (SELECT 1 FROM public.orders WHERE id = '80000000-0000-4000-8000-000000000008'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- E4. Hidden also means inert. An INSERT into order_responses never evaluates
-- the SELECT policies of public.orders, so invisibility alone does not stop a
-- master holding a cached order id.
SET ROLE authenticated;
SELECT public.fx_become('20000000-0000-4000-8000-000000000002');
SELECT public.fx_assert_denied('no new response may be attached to a hidden task',
  $$INSERT INTO public.order_responses (order_id, master_id, l2_id, message)
    VALUES ('70000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', 'plumbing', 'Возьмусь')$$,
  'order_moderation_hidden');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- E5. The owner cannot undo the moderation.
SET ROLE authenticated;
SELECT public.fx_become('10000000-0000-4000-8000-000000000001');
SELECT public.fx_assert_denied('the owner cannot clear the moderation mark',
  $$UPDATE public.orders SET moderation_hidden_at = NULL
     WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  'order_moderation_is_server_managed');
SELECT public.fx_assert_denied('the owner cannot clear the moderation mark with an unqualified UPDATE',
  $$UPDATE public.orders SET moderation_hidden_at = NULL, moderation_hidden_by = NULL$$,
  'order_moderation_is_server_managed');
SELECT public.fx_assert_denied('the owner cannot reassign the moderation mark to somebody else',
  $$UPDATE public.orders SET moderation_hidden_by = '10000000-0000-4000-8000-000000000001'
     WHERE id = '70000000-0000-4000-8000-000000000007'$$,
  'order_moderation_is_server_managed');
-- A new task carrying a moderation mark is normalised rather than refused:
-- refusing it would turn an unknown future client field into a publish failure.
SELECT public.fx_assert_allowed('a task may be created with a moderation mark in the payload',
  $$INSERT INTO public.orders (id, client_id, l2_id, title, moderation_hidden_at)
    VALUES ('33333333-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000001',
            'plumbing', 'Пред-скрытая', now())$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $mark_survived$
BEGIN
  PERFORM public.fx_assert('the moderation mark survived every attempt to clear it',
    (SELECT moderation_hidden_at IS NOT NULL FROM public.orders
      WHERE id = '70000000-0000-4000-8000-000000000007'));
  PERFORM public.fx_assert('a new task is created visible whatever the client sent',
    NOT EXISTS (SELECT 1 FROM public.orders
                WHERE id = '33333333-0000-4000-8000-000000000033'
                  AND moderation_hidden_at IS NOT NULL));
  DELETE FROM public.orders WHERE id = '33333333-0000-4000-8000-000000000033';
END
$mark_survived$;

-- E6. The action is reversible. An irreversible moderation mistake is worse
-- than the content it removed.
SET ROLE authenticated;
SELECT public.fx_become('f0000000-0000-4000-8000-00000000000f');
SELECT public.fx_assert_allowed('a moderator can unhide',
  $$SELECT public.admin_set_order_hidden('70000000-0000-4000-8000-000000000007', false)$$);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

SET ROLE anon;
SELECT public.fx_become(NULL);
SELECT public.fx_assert('unhiding restores the task to the anonymous feed',
  EXISTS (SELECT 1 FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'));
RESET ROLE;

DO $unhide_clean$
BEGIN
  PERFORM public.fx_assert('unhiding clears both moderation columns',
    (SELECT moderation_hidden_at IS NULL AND moderation_hidden_by IS NULL
     FROM public.orders WHERE id = '70000000-0000-4000-8000-000000000007'));
END
$unhide_clean$;

-- ===========================================================================
-- F. Restore the seeded state so rollback equivalence measures the drafts
-- ===========================================================================
-- Everything created or removed by the probes above is undone here, explicitly,
-- as the superuser (no JWT identity, so the guards step aside by design).

SELECT set_config('request.jwt.claim.sub', '', false);

DELETE FROM public.order_responses WHERE id = '22222222-0000-4000-8000-000000000022';
DELETE FROM public.orders WHERE id = '11111111-0000-4000-8000-000000000011';
DELETE FROM public.reviews
 WHERE author_id = '20000000-0000-4000-8000-000000000002'
   AND target_id = '40000000-0000-4000-8000-000000000004';
DELETE FROM public.reports WHERE description = 'Жалоба от приостановленного';

INSERT INTO public.orders (id, client_id, l2_id, title, description, city_id, status)
VALUES ('60000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003',
        'plumbing', 'Установить смеситель', 'Ванная', 'nazran', 'open');

UPDATE public.order_responses SET status = 'sent'
 WHERE id = 'b0000000-0000-4000-8000-00000000000b';
UPDATE public.orders SET status = 'cancelled' WHERE id = '80000000-0000-4000-8000-000000000008';
UPDATE public.users SET first_name = 'Клиент С' WHERE id = '30000000-0000-4000-8000-000000000003';

DO $restored$
BEGIN
  PERFORM public.fx_assert('the seeded row set is restored',
    (SELECT count(*) FROM public.orders) = 4
    AND (SELECT count(*) FROM public.order_responses) = 2
    AND (SELECT count(*) FROM public.reviews) = 1);
  PERFORM public.fx_assert('nothing is left hidden before rollback is attempted',
    (SELECT count(*) FROM public.orders WHERE moderation_hidden_at IS NOT NULL) = 0);
  -- The two suspensions are intentionally KEPT: the rollback assertions prove
  -- that reverting 0126 makes them meaningless again.
  PERFORM public.fx_assert('the two suspensions are still in place',
    (SELECT count(*) FROM public.users WHERE status = 'suspended') = 2);
END
$restored$;

\echo 'POSTFLIGHT OK: Р3 suspension enforcement and Р5 order moderation both verified on the synthetic fixture'
