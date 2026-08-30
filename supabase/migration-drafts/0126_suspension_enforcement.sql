-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- See supabase/migration-drafts/README.md.
--
-- 0126_suspension_enforcement.sql
--
-- GAP Р3 (TASKS.md, этап 3.6): "приостановка не приостанавливает".
-- public.users.status is not consulted by ANY policy that governs publishing an
-- order, sending a response or writing a review. Its only two real effects are
-- hiding the work phone (0098_get_master_phone_contact_first.sql) and being
-- excluded from the new-order push fan-out (0090_notify_masters_on_new_order.sql).
-- A user suspended by a moderator keeps producing UGC at full speed.
--
-- WHAT THIS MIGRATION MAKES TRUE
--
--   1. A non-active account (suspended / banned / deleted) cannot CREATE new
--      user-generated content: no new order, no new response, no new review.
--   2. A non-active account cannot EDIT the user-generated content it already
--      published, nor relocate it to another category or city. Without this the
--      INSERT rule is cosmetic: the same person rewrites the title and body of a
--      live order into whatever got them suspended, or walks the same listing
--      through every category in turn. This is the exact bypass class proven on
--      a real database in the user-blocking work (0124: an INSERT restriction
--      defeated by UPDATE).
--   3. public.users.status becomes moderator-managed, and public.users.is_admin
--      becomes server-managed. Point 3 is NOT a bonus: without it point 1 is
--      theatre. Today `authenticated` holds a table-wide UPDATE grant on
--      public.users and users_update_own (0001_init.sql:294) restricts the ROW
--      but not the COLUMN, so a suspended user lifts their own suspension with
--      one PATCH — and could equally set is_admin = true first.
--
-- WHAT IT DELIBERATELY LEAVES OPEN (a sanction is not an eviction)
--
--   * reading: feed, own orders, own responses, own reviews, notifications;
--   * closing, cancelling and deleting their own orders, withdrawing their own
--     responses — status-only writes, never content writes;
--   * public.reports INSERT — the complaint/support channel stays open in both
--     directions, including reporting the moderation itself;
--   * public.user_blocks — self-protection is not a privilege;
--   * public.delete_my_account() — it is SECURITY DEFINER
--     (0088_delete_my_account.sql:48-51), so it runs as the function owner and
--     is not an API role; the guards below step aside for it deliberately;
--   * editing their own identity fields (name, avatar, contact phone).
--
-- NOT CLAIMED, and each needs its own decision rather than a silent extension:
--   * catalogue/search visibility of a suspended master — master_profiles is
--     still readable with USING (true) (0001_init.sql:305) and this migration
--     does not delist anybody;
--   * master_profiles.bio, avatars and portfolio images are also user-generated
--     content and are NOT covered here;
--   * push, Realtime, storage objects and signed URLs;
--   * telling the user they were suspended — the published client never reads
--     users.status. See the compatibility note below.
--
-- WHY TRIGGERS AND NOT RLS POLICIES (load-bearing design decision)
--
-- RLS was the obvious shape and it is the wrong one here, for two independent
-- reasons that were checked, not assumed:
--
--   (a) The one review path the CURRENT product actually uses is the RPC
--       public.submit_master_review(p_target_id, p_rating, p_text). It exists in
--       the live database (src/types/database.ts:1755, called from
--       src/features/reviews/use-reviews.ts:128) and has NO migration file in
--       supabase/migrations/ — the Git ledger does not contain it. Its body is
--       therefore UNKNOWN, but the call shape (no p_order_id) only works if it
--       is SECURITY DEFINER, and a SECURITY DEFINER function owned by the table
--       owner is not subject to that table's RLS. An INSERT policy on
--       public.reviews would guard a path nobody takes. A BEFORE INSERT trigger
--       fires for every writer, including that RPC.
--       Meanwhile the RLS path that DOES exist — reviews_insert_participant
--       (0091_review_window_14d.sql) — requires orders.status = 'completed',
--       a state the classifieds model never reaches (docs/SIMPLE_FLOW.md §3).
--   (b) A policy sees one row version at a time: USING gets OLD, WITH CHECK gets
--       NEW. It structurally cannot express "this suspended user may change the
--       status of their order but not its text". A BEFORE UPDATE trigger can.
--
-- The trigger functions below are therefore the enforcement, and no RESTRICTIVE
-- policy is added: a second mechanism that catches a strict subset of the same
-- writes would be redundant surface, not depth.
--
-- POSTGREST REACHABILITY
--
-- Every function created here returns `trigger`. PostgREST cannot expose such a
-- function as /rest/v1/rpc/<name> (it has no callable argument/return mapping),
-- and EXECUTE is additionally revoked from PUBLIC and every API role. Trigger
-- execution does not consult EXECUTE privilege — migration 0009 already relies
-- on exactly that (check_response_not_self is revoked from authenticated and
-- still fires in production). The accompanying fixture asserts both halves.
--
-- PUBLISHED iOS 1.0.1 COMPATIBILITY
--
-- The published client cannot be changed and does not read users.status, so it
-- will keep offering "Опубликовать" and "Откликнуться" to a suspended user. What
-- it shows when the server refuses was measured, not guessed:
--   * response form — app/(details)/orders/[id].tsx:1942 renders
--     `Не удалось отправить отклик. ${submitError}` with the RAW server message;
--   * freeform review sheet — src/features/reviews/MasterReviewSheet.tsx:157
--     renders the raw server message;
--   * order publish — src/features/orders/order-publish-error.ts returns a fixed
--     string, "Сервер отклонил публикацию. Проверьте вход в аккаунт и повторите
--     попытку." That advice is wrong for a suspended user and invites retries.
-- Therefore the messages raised below are written in Russian for a human, and
-- the machine-readable token lives in DETAIL (PostgREST surfaces it as
-- `details`, supabase-js as error.details) so a future client can match on it
-- without parsing prose. ERRCODE 42501 maps to HTTP 403, not 500, so the failure
-- is not reported as a server error.
-- REQUIRED CLIENT STEP (separate task, deliberately not implemented here):
-- read users.status, replace the publish/response/review entry points with an
-- explicit suspended state, and route the user to the support contact named in
-- app/legal/privacy.tsx. Until that ships, the honest description of 1.0.1 is
-- "the action fails with a readable Russian reason", not "the user understands".

BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  -- (1) Schema presence. Never guess the live shape.
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_responses') IS NULL
     OR to_regclass('public.reviews') IS NULL THEN
    RAISE EXCEPTION 'suspension_enforcement_schema_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'suspension_enforcement_auth_uid_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (2) Every column named in a trigger argument list must exist. A column that
  -- does not exist compares NULL to NULL for both row versions and silently
  -- guards nothing, so a typo would produce a green migration and no protection.
  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO v_missing
  FROM (
    VALUES
      ('users', 'id'),
      ('users', 'status'),
      ('users', 'is_admin'),
      ('orders', 'client_id'),
      ('orders', 'title'),
      ('orders', 'description'),
      ('orders', 'photo_urls'),
      ('orders', 'contact_name'),
      ('orders', 'l2_id'),
      ('orders', 'city_id'),
      ('orders', 'district'),
      ('order_responses', 'master_id'),
      ('order_responses', 'message'),
      ('order_responses', 'lead_time'),
      ('reviews', 'author_id'),
      ('reviews', 'text'),
      ('reviews', 'rating')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS live_column
    WHERE live_column.table_schema = 'public'
      AND live_column.table_name = required.table_name
      AND live_column.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'suspension_enforcement_columns_require_live_audit: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- (3) The status vocabulary. The guard treats "anything that is not active"
  -- as restricted, so the value 'active' must exist and mean what it means.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS type_row
    JOIN pg_enum AS enum_row ON enum_row.enumtypid = type_row.oid
    JOIN pg_namespace AS schema_row ON schema_row.oid = type_row.typnamespace
    WHERE schema_row.nspname = 'public'
      AND type_row.typname = 'user_status'
      AND enum_row.enumlabel = 'active'
  ) THEN
    RAISE EXCEPTION 'suspension_enforcement_user_status_enum_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (4) API role names. The users guard distinguishes "a PostgREST client" from
  -- "a server path" by current_user; if those roles are not the standard
  -- Supabase ones, that test means nothing.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'suspension_enforcement_api_roles_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (5) The guards must be created by a role whose SECURITY DEFINER identity is
  -- worth something.
  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'suspension_enforcement_definer_owner_must_not_be_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  -- (6) Name collision. Nothing here overwrites an object it did not create.
  IF to_regprocedure('public.guard_content_author_active()') IS NOT NULL
     OR to_regprocedure('public.guard_user_privilege_columns()') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname IN (
           'orders_author_active_guard',
           'order_responses_author_active_guard',
           'reviews_author_active_guard',
           'users_privilege_columns_guard'
         )
     ) THEN
    RAISE EXCEPTION 'suspension_enforcement_object_name_collision_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'Do not overwrite an object this migration did not create. Inventory the live object and decide explicitly.';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- Guard 1 — a non-active account creates and edits no content
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER with row_security = off is load-bearing. The status lookup
-- must succeed identically for a PostgREST write (where public.users RLS would
-- otherwise apply) and for a SECURITY DEFINER RPC. Reading the actor's row
-- through the caller's RLS would make the answer depend on a policy set this
-- migration does not own.
--
-- The actor is auth.uid(), NOT the row owner column. auth.uid() reads the
-- per-request JWT claim, which stays correct inside SECURITY DEFINER functions,
-- and is NULL for cron, migrations and service_role — those paths must keep
-- working (expire_old_orders, 0075 crons, moderation itself).
--
-- Fail-closed on an unknown actor: a JWT whose public.users row is gone is not
-- a healthy session, and admitting it would be the only way to turn a missing
-- row into an unrestricted writer.
CREATE FUNCTION public.guard_content_author_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_status public.user_status;
  v_column text;
BEGIN
  -- No JWT identity: cron, migration, service_role. Not a moderated actor.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_row.status INTO v_status
  FROM public.users AS user_row
  WHERE user_row.id = v_actor;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Аккаунт не найден. Войдите заново.'
      USING ERRCODE = '42501', DETAIL = 'account_unknown';
  END IF;

  IF v_status = 'active' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Аккаунт ограничен: публикация, отклики и отзывы недоступны. Обратитесь в поддержку.'
      USING ERRCODE = '42501', DETAIL = 'account_not_active';
  END IF;

  -- UPDATE: only the content columns named in the trigger definition are
  -- frozen. Closing, cancelling, withdrawing and deleting stay available, so a
  -- restricted user is never trapped with content they can no longer retract.
  --
  -- A trigger attached without a column list is a misconfiguration, not a
  -- licence. PostgreSQL leaves TG_ARGV NULL in that case, and `FOREACH ... IN
  -- ARRAY NULL` raises "FOREACH expression must not be null" — a cryptic error
  -- that would reach a user. Freeze the whole row instead: fail closed, with
  -- the message the user is supposed to see.
  IF TG_ARGV IS NULL OR cardinality(TG_ARGV) = 0 THEN
    RAISE EXCEPTION 'Аккаунт ограничен: изменить публикацию нельзя. Обратитесь в поддержку.'
      USING ERRCODE = '42501', DETAIL = 'account_not_active';
  END IF;

  FOREACH v_column IN ARRAY TG_ARGV
  LOOP
    IF (to_jsonb(NEW) -> v_column) IS DISTINCT FROM (to_jsonb(OLD) -> v_column) THEN
      RAISE EXCEPTION 'Аккаунт ограничен: изменить текст и фото публикации нельзя. Обратитесь в поддержку.'
        USING ERRCODE = '42501', DETAIL = 'account_not_active';
    END IF;
  END LOOP;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_content_author_active() IS
  'Blocks creation of user-generated content, and edits to the content columns named in TG_ARGV, while the acting account (auth.uid()) is not active. Runs for every writer including SECURITY DEFINER RPCs; steps aside when there is no JWT identity (cron, service_role, migrations).';

REVOKE ALL ON FUNCTION public.guard_content_author_active()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER orders_author_active_guard
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_content_author_active(
  -- what the listing says
  'title', 'description', 'photo_urls', 'contact_name',
  -- where the listing appears. Relocating a task the moderator acted on into
  -- every category and city in turn is republishing it, even though not a
  -- single character of its text changed.
  'l2_id', 'city_id', 'district'
);

CREATE TRIGGER order_responses_author_active_guard
BEFORE INSERT OR UPDATE ON public.order_responses
FOR EACH ROW
EXECUTE FUNCTION public.guard_content_author_active('message', 'lead_time');

CREATE TRIGGER reviews_author_active_guard
BEFORE INSERT OR UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.guard_content_author_active('text', 'rating');

-- ---------------------------------------------------------------------------
-- Guard 2 — a sanction the sanctioned user cannot lift
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER on purpose: this guard must be able to tell a PostgREST
-- client (current_user = anon / authenticated) from a server path
-- (SECURITY DEFINER RPC, service_role, cron, migration), and current_user inside
-- a SECURITY DEFINER function is the function owner, which would erase exactly
-- that distinction.
--
-- The admin lookup runs under the caller's own RLS. That is safe rather than
-- accidental: the row being read is the caller's own row (id = auth.uid()),
-- which users_select_own (0001_init.sql) grants, and a hidden row yields NULL,
-- which is read as "not an admin" — the fail-closed direction.
--
-- SCOPE: this is the narrowest possible slice of the hardening described in
-- docs/ADMIN_PANEL.md §2. It locks the two columns without which Р3 and Р5 are
-- unenforceable. It does NOT close the wider findings — users_admin_update
-- (0030) still lets an admin write every other column of every user, and
-- master_profiles/master_categories owner-write remains wide open. Those belong
-- to the reviewed hardening migration, and this guard is written so that a later
-- hardening trigger can coexist with it or replace it.
CREATE FUNCTION public.guard_user_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_is_admin boolean;
BEGIN
  -- Server paths keep their existing narrow contracts: handle_new_auth_user,
  -- delete_my_account, moderation performed with the service key, seeds, crons.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- users_insert_own exists, so a client can create its own row. It may not
    -- create it pre-promoted or pre-cleared.
    NEW.is_admin := false;
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Права модератора выдаются только на сервере.'
      USING ERRCODE = '42501', DETAIL = 'is_admin_is_server_managed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT user_row.is_admin INTO v_actor_is_admin
    FROM public.users AS user_row
    WHERE user_row.id = auth.uid();

    IF COALESCE(v_actor_is_admin, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Статус аккаунта меняет только модератор.'
        USING ERRCODE = '42501', DETAIL = 'user_status_is_moderator_managed';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_user_privilege_columns() IS
  'public.users.is_admin becomes unwritable by API roles and public.users.status becomes moderator-only. RLS restricts the row, never the column, and authenticated holds a table-wide UPDATE grant, so without this a suspended user lifts their own suspension — or grants themselves is_admin first — with a single PATCH.';

REVOKE ALL ON FUNCTION public.guard_user_privilege_columns()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER users_privilege_columns_guard
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_user_privilege_columns();

COMMIT;

-- ---------------------------------------------------------------------------
-- MANDATORY LIVE STEP BEFORE PROMOTION, not solvable locally
-- ---------------------------------------------------------------------------
-- This migration stops NEW self-promotion. It cannot revoke a flag that is
-- already set. Before promoting, inventory the live administrators read-only:
--
--   SELECT id, is_admin, is_demo, status FROM public.users WHERE is_admin;
--
-- docs/ADMIN_PANEL.md §2 records a demo account with is_admin = true whose
-- password is in Git history, and the 2026-08-26 live audit found that account
-- still active after 0094_revoke_admin_from_demo_users.sql. Every unexpected
-- administrator must be removed by an explicit, separately reviewed change
-- before Р5 (0128) grants moderators any new capability.
