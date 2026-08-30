-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- 0124_user_blocking_core.sql
--
-- Apple UGC safety: a user can block another user; the block hides orders and
-- responses in BOTH directions for signed-in readers and rejects new responses
-- between the pair. Nothing else is claimed.
--
-- This draft is deliberately decoupled from two unrelated changes that draft
-- 0122 had fused into one file:
--
--   1. master contact visibility (public.get_master_phone / users.contact_phone)
--      — a BREAKING change for the published iOS 1.0.1 catalogue flow, which
--      requires its own compatibility phase and its own migration;
--   2. UGC report targets (public.report_target_type / public.reports)
--      — additive, but a separate product surface.
--
-- Neither `get_master_phone`, nor `users.contact_phone`, nor
-- `public.users_private` is referenced, read or altered here. The published
-- client keeps its current catalogue contact behaviour unchanged.
--
-- COMPATIBILITY ARGUMENT (must be proven, not assumed):
-- at apply time public.user_blocks is empty and no published client can write
-- to it, so every RESTRICTIVE policy below evaluates to TRUE for every row and
-- the visible row sets are byte-identical to the pre-migration ones. The
-- accompanying fixture asserts exactly that instead of claiming it.
--
-- NOT CLAIMED and still open, each requiring a live read-only snapshot:
-- profile/catalogue/search visibility, push and Realtime delivery, storage and
-- signed URLs, the full SECURITY DEFINER/RPC inventory, notification triggers.
-- Draft 0122 carries the machine-readable
-- `universal_backend_promotion_blockers` registry for those surfaces; whether
-- that registry ships with this migration or with the universal-board drafts
-- is an open reviewer decision, not something this file decides silently.

BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  -- (1) Schema presence. Never guess the live shape.
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_responses') IS NULL THEN
    RAISE EXCEPTION 'user_blocking_schema_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'user_blocking_auth_uid_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO v_missing
  FROM (
    VALUES
      ('users', 'id'),
      ('orders', 'id'),
      ('orders', 'client_id'),
      ('order_responses', 'order_id'),
      ('order_responses', 'master_id')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS live_column
    WHERE live_column.table_schema = 'public'
      AND live_column.table_name = required.table_name
      AND live_column.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'user_blocking_columns_require_live_audit: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- (2) Row level security must already be ENABLED on both target tables.
  -- A RESTRICTIVE policy on a table with RLS disabled is silently inert: the
  -- migration would "succeed" and protect nothing. This is the single most
  -- dangerous unverifiable assumption in the whole design.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS table_row
    JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'orders'
      AND table_row.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_class AS table_row
    JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'order_responses'
      AND table_row.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'user_blocking_requires_row_level_security_enabled_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'A RESTRICTIVE policy composes with AND on top of PERMISSIVE policies only while RLS is enabled; with RLS off it is inert and provides no protection.';
  END IF;

  -- (3) A PERMISSIVE baseline must exist. Existing policies are never renamed,
  -- rewritten or guessed here; this only proves that the AND-composition has
  -- something to compose with. Only metadata is inspected, never expressions.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_responses'
      AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_responses'
      AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'ALL')
  ) THEN
    RAISE EXCEPTION 'user_blocking_permissive_baseline_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (4) Name collision. Every object below is created with a plain CREATE, so
  -- a pre-existing object of the same name aborts the transaction instead of
  -- being silently replaced. This guard turns that into a named error.
  IF to_regclass('public.user_blocks') IS NOT NULL
     OR to_regprocedure('public.current_user_blocked_counterparties()') IS NOT NULL
     OR to_regprocedure('public.current_user_can_interact_with(uuid)') IS NOT NULL
     OR to_regprocedure('public.order_client_id(uuid)') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND policyname IN (
           'orders_block_relation_restrictive',
           'order_responses_block_relation_select_restrictive',
           'order_responses_block_relation_insert_restrictive',
           'user_blocks_select_own',
           'user_blocks_insert_own',
           'user_blocks_delete_own'
         )
     ) THEN
    RAISE EXCEPTION 'user_blocking_object_name_collision_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'Do not overwrite an object this migration did not create. Inventory the live object and decide explicitly.';
  END IF;

  -- (5) The SECURITY DEFINER helpers below inherit the executing role as owner.
  -- Creating them as an API role would make SECURITY DEFINER meaningless.
  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'user_blocking_definer_owner_must_not_be_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'user_blocking_api_roles_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- Owner-managed block list
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

COMMENT ON TABLE public.user_blocks IS
  'Owner-managed UGC safety blocks. A pair hides orders and responses in both directions and rejects new responses between the pair. Rows are immutable: there is no UPDATE policy and no UPDATE grant; a block is removed by deleting it.';

-- Reverse lookup for the "who blocked me" direction.
CREATE INDEX user_blocks_blocked_id_idx
  ON public.user_blocks (blocked_id, blocker_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = blocker_id);

CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

COMMENT ON POLICY user_blocks_select_own ON public.user_blocks IS
  'Only the blocker reads its own rows. The reverse direction is deliberately not readable: otherwise a blocked user could enumerate who blocked them.';

-- Supabase default privileges may grant broad rights on a freshly created
-- table, so the grant set is stated explicitly instead of being inherited.
-- service_role is left without any privilege on purpose: nothing needs it yet,
-- and moderation access must be an explicit, separately reviewed migration.
REVOKE ALL ON TABLE public.user_blocks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_blocks TO authenticated;

-- ---------------------------------------------------------------------------
-- Relationship helpers
-- ---------------------------------------------------------------------------

-- Set-shaped helper used by the RLS policies. It takes no argument, so an
-- uncorrelated (SELECT ...) around it is folded into a single InitPlan and is
-- evaluated once per query instead of once per row.
-- COALESCE to an empty array is load-bearing: NULL = ANY (...) yields NULL,
-- and NOT NULL reads as deny, which would hide the whole anonymous feed.
CREATE FUNCTION public.current_user_blocked_counterparties()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $function$
  SELECT COALESCE(array_agg(pairs.counterpart), ARRAY[]::uuid[])
  FROM (
    SELECT CASE
             WHEN block_row.blocker_id = auth.uid() THEN block_row.blocked_id
             ELSE block_row.blocker_id
           END AS counterpart
    FROM public.user_blocks AS block_row
    WHERE auth.uid() IS NOT NULL
      AND (block_row.blocker_id = auth.uid() OR block_row.blocked_id = auth.uid())
  ) AS pairs;
$function$;

COMMENT ON FUNCTION public.current_user_blocked_counterparties() IS
  'Every user id blocked by or blocking the current caller, in one array. Empty for anonymous callers: an anonymous visitor has no identity against which a personal block list could be evaluated.';

REVOKE ALL ON FUNCTION public.current_user_blocked_counterparties()
  FROM PUBLIC, anon, authenticated, service_role;
-- anon needs EXECUTE because PostgreSQL does not guarantee OR short-circuiting
-- in the orders policy below. An anonymous call returns an empty array and
-- discloses no relationship state.
GRANT EXECUTE ON FUNCTION public.current_user_blocked_counterparties()
  TO anon, authenticated;

-- Scalar form for triggers, RPCs and future surfaces. Fail-closed: anonymous
-- callers and NULL targets can never interact.
CREATE FUNCTION public.current_user_can_interact_with(p_other_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN p_other_id IS NULL THEN false
    WHEN auth.uid() = p_other_id THEN true
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.user_blocks AS block_row
      WHERE (block_row.blocker_id = auth.uid() AND block_row.blocked_id = p_other_id)
         OR (block_row.blocker_id = p_other_id AND block_row.blocked_id = auth.uid())
    )
  END;
$function$;

COMMENT ON FUNCTION public.current_user_can_interact_with(uuid) IS
  'Authenticated caller relationship guard. Anonymous callers and NULL targets fail closed.';

REVOKE ALL ON FUNCTION public.current_user_can_interact_with(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can_interact_with(uuid)
  TO anon, authenticated;

-- Resolves an order owner WITHOUT depending on whether the caller may read the
-- order row. A plain sub-SELECT on public.orders inside the order_responses
-- policy would run under the caller's RLS, so a response to an order that is
-- merely invisible (cancelled, expired) would resolve to NULL and be denied
-- even when no block exists. Blocking must not be entangled with order status.
CREATE FUNCTION public.order_client_id(p_order_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $function$
  SELECT order_row.client_id
  FROM public.orders AS order_row
  WHERE order_row.id = p_order_id;
$function$;

COMMENT ON FUNCTION public.order_client_id(uuid) IS
  'Order owner id for RLS composition only. Discloses nothing an authenticated feed reader cannot already see.';

REVOKE ALL ON FUNCTION public.order_client_id(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_client_id(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RESTRICTIVE composition. Existing PERMISSIVE policies are untouched.
-- ---------------------------------------------------------------------------

-- NOTE ON SYNTAX: `x = ANY ((SELECT array_returning_function()))` does NOT
-- work — PostgreSQL parses it as an ANY sublink and fails with
-- "operator does not exist: uuid = uuid[]". The COALESCE wrapper below makes
-- the operand an array expression and additionally keeps the anonymous path
-- open if the helper ever returned NULL.
CREATE POLICY orders_block_relation_restrictive ON public.orders
  AS RESTRICTIVE
  FOR SELECT TO anon, authenticated
  USING (
    (SELECT auth.uid()) IS NULL
    OR orders.client_id = (SELECT auth.uid())
    OR NOT (
      orders.client_id = ANY (
        COALESCE((SELECT public.current_user_blocked_counterparties()), ARRAY[]::uuid[])
      )
    )
  );

COMMENT ON POLICY orders_block_relation_restrictive ON public.orders IS
  'Signed-in feed and direct-id reads hide an order when viewer and owner blocked each other in either direction. Anonymous visitors are unaffected: they have no identity to evaluate a personal block list against.';

CREATE POLICY order_responses_block_relation_select_restrictive
  ON public.order_responses
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT (
      order_responses.master_id = ANY (
        COALESCE((SELECT public.current_user_blocked_counterparties()), ARRAY[]::uuid[])
      )
    )
    AND NOT (
      public.order_client_id(order_responses.order_id) = ANY (
        COALESCE((SELECT public.current_user_blocked_counterparties()), ARRAY[]::uuid[])
      )
    )
  );

COMMENT ON POLICY order_responses_block_relation_select_restrictive ON public.order_responses IS
  'A response is hidden when the viewer blocked (or was blocked by) either the responding master or the order owner.';

CREATE POLICY order_responses_block_relation_insert_restrictive
  ON public.order_responses
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT (
      order_responses.master_id = ANY (
        COALESCE((SELECT public.current_user_blocked_counterparties()), ARRAY[]::uuid[])
      )
    )
    AND NOT (
      public.order_client_id(order_responses.order_id) = ANY (
        COALESCE((SELECT public.current_user_blocked_counterparties()), ARRAY[]::uuid[])
      )
    )
  );

COMMENT ON POLICY order_responses_block_relation_insert_restrictive ON public.order_responses IS
  'No new response may be created between a blocked pair in either direction.';

-- NO RESTRICTIVE UPDATE policy on public.order_responses, on purpose:
--   * withdraw_response is SECURITY DEFINER (migration 0081) and would bypass
--     it anyway, so it would add no protection;
--   * accept_response is SECURITY INVOKER (migration 0110), so a restrictive
--     UPDATE would turn a blocked-but-still-open response into a state the
--     client can neither see nor resolve;
--   * a blocked master can still edit only its own response row, which the
--     counterpart can no longer read at all.
-- This is a named residual risk handed to security review, not an omission.

COMMIT;
