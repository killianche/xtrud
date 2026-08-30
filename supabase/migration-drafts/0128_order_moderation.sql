-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- See supabase/migration-drafts/README.md.
--
-- 0128_order_moderation.sql
--
-- GAP Р5 (TASKS.md, этап 3.6): "жалоба на задание не имеет действий".
-- app/(details)/admin/reports.tsx:150-190 builds action branches only for
-- target_type 'user' and 'review'; a report about an order offers nothing but
-- "Отклонить". There is no admin policy on public.orders or
-- public.order_responses at all — 0030_admin_flag_and_policies.sql covers only
-- reports, users and reviews. Orders are the one UGC surface with photos and
-- free text, which is precisely what App Store Guideline 1.2 is about.
--
-- ORDERING REQUIREMENT — this file refuses to run on its own
--
-- Every capability below is gated on public.users.is_admin. That flag is
-- self-settable today: users_update_own (0001_init.sql:294) restricts the row
-- and not the column, and `authenticated` holds a table-wide UPDATE grant
-- (docs/ADMIN_PANEL.md §2, live audit 2026-08-26 in PROJECT_OPERATIONS.md §8).
-- Shipping a moderator capability on top of a self-service admin flag would be
-- a downgrade, not a fix. The preflight therefore ABORTS unless the is_admin
-- lock from 0126_suspension_enforcement.sql is already in place.
--
-- WHAT THIS MIGRATION ADDS — one action, both directions
--
--   public.orders.moderation_hidden_at / moderation_hidden_by
--     A moderator hides a reported order; the same call unhides it. There is no
--     ladder of sanctions, no severity, no expiry and no free-text verdict
--     field: the verdict already has a home in reports.admin_note, and a real
--     admin action journal is a named, separate item (docs/ADMIN_PANEL.md §4).
--
--   public.admin_set_order_hidden(p_order_id uuid, p_hidden boolean)
--     The only way to write those columns from an API role. This is a
--     deliberate departure from users_admin_update (0030), which the admin-panel
--     contract explicitly calls "не образец": RLS cannot restrict columns, so a
--     "moderator may UPDATE orders" policy would hand a moderator every column
--     of every order — title, price, owner. A SECURITY DEFINER RPC restricts by
--     construction. It is reachable at /rest/v1/rpc/admin_set_order_hidden, as
--     every public function is, and therefore checks the caller itself.
--
--   orders_admin_select
--     Without it a moderator cannot see the subject of the report at all once
--     the order leaves 'open' — orders_read_open_or_own (0076) shows non-open
--     orders only to their participants. This is the server half of
--     docs/ADMIN_PANEL.md §3 "модератор не видит предмет жалобы". The client
--     half (rendering the order behind reports.target_id instead of a bare uuid)
--     is a separate task and is NOT implemented here.
--
--   two RESTRICTIVE SELECT policies + one INSERT trigger
--     Hiding has to mean invisible AND inert. A hidden order is removed from
--     every reader except its owner and moderators, and no new response can be
--     attached to it. The INSERT trigger is not belt-and-braces: an INSERT into
--     order_responses never evaluates the SELECT policies of public.orders, so
--     a master holding an order id from a cached feed page would still be able
--     to respond to an order they can no longer see. This is the same bypass
--     class the user-blocking work proved on a real database (0124).
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * it does not touch orders.status, so no enum value is added and no
--     published client meets a status it cannot render;
--   * it does not hide or moderate order_responses — report_target_type
--     (0029) has no 'response' member, so a response cannot even be reported
--     today; building a queue for an unreachable target is work for nobody;
--   * it does not stop the owner from deleting a hidden order. They can already
--     delete their own orders (orders_owner_delete_open / _history), and taking
--     that away to preserve evidence is an audit-retention decision, not part of
--     "a moderator can hide a task";
--   * it does not notify the owner. The published client will show the order in
--     "Мои заказы" exactly as before, silently receiving no responses. That is
--     dishonest UI by .claude/rules/design-quality.md §5 and is the REQUIRED
--     CLIENT STEP below.
--
-- PUBLISHED iOS 1.0.1 COMPATIBILITY — measured, not assumed
--   * new nullable columns only; every client insert path
--     (src/features/orders/use-create-order.ts:60-81) sends an explicit column
--     list and never sends these two;
--   * a hidden order disappears from the anonymous and signed-in feed, which is
--     an ordinary "order is gone" state the client already handles;
--   * a master who already responded: src/features/orders/use-my-responses.ts:109
--     filters rows whose embedded `order` is null, so the response silently
--     drops out of the list instead of rendering a broken card. Verified by
--     reading the hook, not inferred;
--   * a master who tries to respond anyway gets a readable Russian message —
--     app/(details)/orders/[id].tsx:1942 renders the raw server message.
-- REQUIRED CLIENT STEP (separate task): render the reported order in the
-- moderation queue, add the hide/unhide action, and show the owner that their
-- task was hidden by moderation.

BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  -- (1) Schema presence.
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_responses') IS NULL
     OR to_regclass('public.reports') IS NULL THEN
    RAISE EXCEPTION 'order_moderation_schema_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('public.is_current_user_admin()') IS NULL THEN
    RAISE EXCEPTION 'order_moderation_required_functions_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO v_missing
  FROM (
    VALUES
      ('users', 'id'),
      ('users', 'is_admin'),
      ('orders', 'id'),
      ('orders', 'client_id'),
      ('order_responses', 'order_id'),
      ('reports', 'target_type'),
      ('reports', 'target_id')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS live_column
    WHERE live_column.table_schema = 'public'
      AND live_column.table_name = required.table_name
      AND live_column.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'order_moderation_columns_require_live_audit: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- (2) HARDENING PRECONDITION. Refuse to grant moderators a new capability
  -- while any authenticated user can make themselves a moderator.
  IF to_regprocedure('public.guard_user_privilege_columns()') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
       JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgenabled <> 'D'
         AND schema_row.nspname = 'public'
         AND table_row.relname = 'users'
         AND trigger_row.tgname = 'users_privilege_columns_guard'
     ) THEN
    RAISE EXCEPTION 'order_moderation_requires_is_admin_hardening_first'
      USING ERRCODE = 'P0001',
            HINT = 'Apply 0126_suspension_enforcement.sql (or an equivalent reviewed lock on public.users.is_admin) first. Without it public.users.is_admin is self-settable and every capability in this migration is available to everyone.';
  END IF;

  -- (3) RLS must already be enabled on public.orders. A RESTRICTIVE policy on a
  -- table with RLS disabled is silently inert: this migration would "succeed"
  -- and hide nothing.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS table_row
    JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'orders'
      AND table_row.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'order_moderation_requires_row_level_security_enabled_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (4) A PERMISSIVE SELECT baseline must exist for the RESTRICTIVE policies to
  -- compose with. Only metadata is inspected; no existing expression is read,
  -- rewritten or renamed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
  ) THEN
    RAISE EXCEPTION 'order_moderation_permissive_baseline_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'order_moderation_definer_owner_must_not_be_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  -- (5) Name collision.
  IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders'
         AND column_name IN ('moderation_hidden_at', 'moderation_hidden_by')
     )
     OR to_regprocedure('public.admin_set_order_hidden(uuid, boolean)') IS NOT NULL
     OR to_regprocedure('public.guard_order_moderation_columns()') IS NOT NULL
     OR to_regprocedure('public.guard_response_target_not_hidden()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND policyname IN (
           'orders_moderation_hidden_anon_restrictive',
           'orders_moderation_hidden_auth_restrictive',
           'orders_admin_select'
         )
     )
     OR EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname IN (
           'orders_moderation_columns_guard',
           'order_responses_hidden_order_guard'
         )
     ) THEN
    RAISE EXCEPTION 'order_moderation_object_name_collision_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'Do not overwrite an object this migration did not create. Inventory the live object and decide explicitly.';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- The moderation mark
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN moderation_hidden_at timestamptz,
  ADD COLUMN moderation_hidden_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.moderation_hidden_at IS
  'Set by public.admin_set_order_hidden when a moderator hides a reported task; NULL means visible. Not a status: orders.status keeps its own meaning and no published client has to learn a new value.';
COMMENT ON COLUMN public.orders.moderation_hidden_by IS
  'Moderator who hid the task. ON DELETE SET NULL so removing a moderator account never deletes tasks. The reason for the decision belongs to reports.admin_note; a full admin action journal is a separate, named piece of work.';

-- No index. The RESTRICTIVE policies filter on `moderation_hidden_at IS NULL`,
-- which matches nearly every row, so an index on the selective (NOT NULL) side
-- would never be chosen for those reads and would only cost writes.

-- ---------------------------------------------------------------------------
-- The mark is server-managed
-- ---------------------------------------------------------------------------
--
-- Without this the whole migration is decorative: `authenticated` has a
-- table-wide UPDATE grant on public.orders and orders_owner_edit_open (0076)
-- lets the owner update their own open order, so the owner would simply
-- `UPDATE orders SET moderation_hidden_at = NULL` and unhide themselves.
-- Revoking the column grant instead is not equivalent: a column-level REVOKE
-- does not cut through an existing table-level UPDATE grant, so it would
-- require re-granting an explicit column list for public.orders, which cannot
-- be authored without the live column inventory and would fail closed on every
-- future column. A trigger is exact and needs no column list.
--
-- SECURITY INVOKER, for the same reason as guard_user_privilege_columns: the
-- distinction being made is "PostgREST client" vs "server path", and
-- current_user inside a SECURITY DEFINER function would always be the owner.
CREATE FUNCTION public.guard_order_moderation_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.moderation_hidden_at := NULL;
    NEW.moderation_hidden_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.moderation_hidden_at IS DISTINCT FROM OLD.moderation_hidden_at
     OR NEW.moderation_hidden_by IS DISTINCT FROM OLD.moderation_hidden_by THEN
    RAISE EXCEPTION 'Отметку модерации изменяет только модератор.'
      USING ERRCODE = '42501', DETAIL = 'order_moderation_is_server_managed';
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_order_moderation_columns() IS
  'orders.moderation_hidden_at / _by are writable only from a server path (the SECURITY DEFINER RPC, service_role, migrations). Blocks the owner from unhiding their own moderated task, including through an UPDATE that reads no column and therefore never evaluates a SELECT policy.';

REVOKE ALL ON FUNCTION public.guard_order_moderation_columns()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER orders_moderation_columns_guard
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_moderation_columns();

-- ---------------------------------------------------------------------------
-- A hidden task is invisible
-- ---------------------------------------------------------------------------
--
-- Two policies rather than one because of an ACL detail that would otherwise
-- take down the whole anonymous feed: public.is_current_user_admin() is revoked
-- from anon (0030), PostgreSQL does not guarantee OR short-circuiting, and an
-- anonymous reader evaluating it would get "permission denied for function".
-- Splitting by role keeps the admin branch out of the anonymous expression
-- without widening any existing function ACL.
CREATE POLICY orders_moderation_hidden_anon_restrictive ON public.orders
  AS RESTRICTIVE
  FOR SELECT TO anon
  USING (orders.moderation_hidden_at IS NULL);

COMMENT ON POLICY orders_moderation_hidden_anon_restrictive ON public.orders IS
  'A task hidden by moderation leaves the anonymous feed entirely.';

CREATE POLICY orders_moderation_hidden_auth_restrictive ON public.orders
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    orders.moderation_hidden_at IS NULL
    OR orders.client_id = (SELECT auth.uid())
    OR (SELECT public.is_current_user_admin())
  );

COMMENT ON POLICY orders_moderation_hidden_auth_restrictive ON public.orders IS
  'A hidden task stays visible to its owner — cutting a person off from their own data is not moderation — and to moderators, who must be able to review and reverse the decision. Everyone else stops seeing it. The (SELECT ...) wrappers make both branches InitPlans evaluated once per query, not once per row.';

CREATE POLICY orders_admin_select ON public.orders
  FOR SELECT TO authenticated
  USING ((SELECT public.is_current_user_admin()));

COMMENT ON POLICY orders_admin_select ON public.orders IS
  'Moderators may read any task in any status. Required to render the subject of a report: orders_read_open_or_own (0076) shows a non-open task only to its participants, so a report about a cancelled or already hidden task would show a bare uuid.';

-- ---------------------------------------------------------------------------
-- A hidden task is inert
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER with row_security = off is the whole point. Under the
-- caller's own RLS the hidden order is invisible, so `EXISTS (... hidden ...)`
-- would be false and the guard would fail OPEN — allowing exactly the response
-- it exists to prevent. The fixture proves this by mutating the function to
-- SECURITY INVOKER and requiring the assertions to fail.
CREATE FUNCTION public.guard_response_target_not_hidden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
BEGIN
  -- No JWT identity: cron, migration, service_role.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders AS order_row
    WHERE order_row.id = NEW.order_id
      AND order_row.moderation_hidden_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Задание скрыто модератором: откликнуться нельзя.'
      USING ERRCODE = '42501', DETAIL = 'order_moderation_hidden';
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_response_target_not_hidden() IS
  'No new response may be attached to a task hidden by moderation. An INSERT into order_responses never evaluates the SELECT policies of public.orders, so hiding alone does not stop a master holding a cached order id.';

REVOKE ALL ON FUNCTION public.guard_response_target_not_hidden()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER order_responses_hidden_order_guard
BEFORE INSERT ON public.order_responses
FOR EACH ROW
EXECUTE FUNCTION public.guard_response_target_not_hidden();

-- ---------------------------------------------------------------------------
-- The one moderator action
-- ---------------------------------------------------------------------------
--
-- Deliberately reachable at /rest/v1/rpc/admin_set_order_hidden, like every
-- function in an exposed schema, and therefore self-checking. Order of checks
-- is load-bearing: authorisation is decided BEFORE existence, so a non-moderator
-- cannot use the error text to learn whether an order id exists.
CREATE FUNCTION public.admin_set_order_hidden(p_order_id uuid, p_hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в аккаунт.'
      USING ERRCODE = '42501', DETAIL = 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users AS user_row
    WHERE user_row.id = v_actor AND user_row.is_admin
  ) THEN
    RAISE EXCEPTION 'Действие доступно только модератору.'
      USING ERRCODE = '42501', DETAIL = 'admin_required';
  END IF;

  IF p_order_id IS NULL OR p_hidden IS NULL THEN
    RAISE EXCEPTION 'Не указано задание.'
      USING ERRCODE = '22004', DETAIL = 'invalid_arguments';
  END IF;

  UPDATE public.orders AS order_row
  SET moderation_hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END,
      moderation_hidden_by = CASE WHEN p_hidden THEN v_actor ELSE NULL END
  WHERE order_row.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Задание не найдено.'
      USING ERRCODE = 'P0002', DETAIL = 'order_not_found';
  END IF;
END
$function$;

COMMENT ON FUNCTION public.admin_set_order_hidden(uuid, boolean) IS
  'The only API-role path that writes orders.moderation_hidden_at/_by. p_hidden = true hides, false unhides; the action is reversible because an irreversible moderation mistake is worse than the content. Reads the admin flag from the database on every call rather than trusting a JWT claim, so revoking a moderator takes effect immediately. Grants no other column of public.orders to anyone.';

REVOKE ALL ON FUNCTION public.admin_set_order_hidden(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_order_hidden(uuid, boolean)
  TO authenticated, service_role;

COMMIT;
