-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- See supabase/migration-drafts/README.md.
--
-- 0126_suspension_enforcement.sql
--
-- GAP Р3 (TASKS.md, этап 3.6): "приостановка не приостанавливает".
-- A user suspended by a moderator keeps producing UGC at full speed, and can
-- lift the suspension themselves.
--
-- RELATIONSHIP TO THE APPLIED MIGRATION 0130 — read this first
--
-- supabase/migrations/0130_guard_user_privilege_columns.sql is APPLIED to
-- production. It creates public.guard_user_privilege_columns() and the trigger
-- users_guard_privilege_columns, and it locks users.is_admin and users.is_demo.
-- This draft does NOT recreate, replace or drop any of that. It requires it,
-- verifies it, and adds only the half 0130 deliberately left open — its own
-- header says so: "Колонка status намеренно НЕ блокируется".
--
-- Verified read-only against production on 2026-08-30:
--   * public.guard_user_privilege_columns() — owner postgres, SECURITY INVOKER,
--     proacl {postgres=X/postgres}; trigger users_guard_privilege_columns is
--     BEFORE UPDATE on public.users and enabled;
--   * users.status still has UPDATE granted to anon, authenticated and
--     service_role, so the sanction is still self-liftable. That is this file.
--
-- WHY A SECOND TRIGGER AND NOT `CREATE OR REPLACE` OF 0130's FUNCTION
--
-- Extending the applied function would be the smaller diff and the larger risk:
--
--   * rollback would stop being a removal and become a restore. 0127 would have
--     to recreate 0130's body from a copy pasted into this repository. If the
--     live body is ever hotfixed — exactly the situation a rollback is for — my
--     revert would silently overwrite production with a stale privilege guard.
--     A rollback that can downgrade a security control is worse than one extra
--     trigger;
--   * the two locks have genuinely different rules. is_admin/is_demo have NO
--     legitimate non-owner writer at all; status has one, the moderator. Fusing
--     them puts an authorisation branch inside a function whose contract is
--     "nobody but the owner", and the next reader has to hold both in their head;
--   * one migration, one reason to change. 0130 owns privilege escalation, this
--     file owns the moderation sanction, and either can be reverted alone.
--
-- The cost is honest: public.users now carries three BEFORE UPDATE triggers.
-- They fire in name order — users_guard_privilege_columns, users_guard_status_column,
-- users_set_updated_at — and none of them modifies NEW, so the order is
-- irrelevant to the result. That is the smaller evil.
--
-- WHAT THIS MIGRATION MAKES TRUE
--
--   1. A non-active account (suspended / banned / deleted) cannot CREATE new
--      user-generated content: no new order, no new response, no new review.
--   2. A non-active account cannot EDIT the content it already published, nor
--      relocate it to another category or city. Without this the INSERT rule is
--      cosmetic: the same person rewrites the title and body of a live order
--      into whatever got them suspended, or walks the same listing through
--      every category in turn. This is the exact bypass class proven on a real
--      database in the user-blocking work (0124: an INSERT restriction defeated
--      by UPDATE).
--   3. public.users.status becomes moderator-managed. Without it points 1 and 2
--      are theatre: `authenticated` holds UPDATE on users.status (verified live),
--      users_update_own restricts the ROW and not the COLUMN, and a suspended
--      user lifts their own suspension with one PATCH.
--
-- WHAT IT DELIBERATELY LEAVES OPEN (a sanction is not an eviction)
--
--   * reading: feed, own orders, own responses, own reviews, notifications;
--   * closing, cancelling and deleting their own orders, withdrawing their own
--     responses — status-only writes, never content writes;
--   * public.reports INSERT — the complaint/support channel stays open in both
--     directions, including reporting the moderation itself;
--   * public.user_blocks — self-protection is not a privilege;
--   * public.delete_my_account() — verified live as SECURITY DEFINER owned by
--     postgres, so current_user inside it is 'postgres' and the status guard
--     steps aside deliberately. Account deletion is an App Store requirement
--     and must not become collateral damage of a sanction;
--   * editing their own identity fields (name, avatar, contact phone).
--
-- NOT CLAIMED, and each needs its own decision rather than a silent extension:
--   * catalogue/search visibility of a suspended master — master_profiles is
--     still readable with USING (true) and this migration does not delist anybody;
--   * master_profiles.bio, avatars and portfolio images are also user-generated
--     content and are NOT covered here;
--   * push, Realtime, storage objects and signed URLs;
--   * telling the user they were suspended — the published client never reads
--     users.status. See the compatibility note below;
--   * the column list in point 2 is a denylist. A content column added by a
--     LATER migration is not covered until it is added here deliberately.
--
-- WHY TRIGGERS AND NOT RLS POLICIES (load-bearing, and now verified live)
--
--   (a) The one review path the CURRENT product uses is the RPC
--       public.submit_master_review(uuid, integer, text). Read-only inspection
--       of production on 2026-08-30 shows it exists, is owned by postgres and
--       has prosecdef = true — SECURITY DEFINER, therefore NOT subject to
--       public.reviews RLS. It also has no migration file anywhere in
--       supabase/migrations/, so the Git ledger does not describe it. An INSERT
--       policy on public.reviews would guard a path nobody takes; a BEFORE
--       INSERT trigger fires for every writer, including that RPC.
--       Meanwhile the RLS path that DOES exist — reviews_insert_participant
--       (0091) — requires orders.status = 'completed', a state the classifieds
--       model never reaches (docs/SIMPLE_FLOW.md §3).
--   (b) A policy sees one row version at a time: USING gets OLD, WITH CHECK gets
--       NEW. It structurally cannot express "this suspended user may change the
--       status of their order but not its text". A BEFORE UPDATE trigger can.
--
-- POSTGREST REACHABILITY
--
-- Both functions created here return `trigger`. PostgREST cannot expose such a
-- function as /rest/v1/rpc/<name>, and EXECUTE is additionally revoked from
-- PUBLIC and every API role — the same shape 0130 uses. Trigger execution does
-- not consult EXECUTE privilege; migration 0009 already relies on exactly that
-- (check_response_not_self is revoked from authenticated and still fires in
-- production). The accompanying fixture asserts both halves.
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
-- `details`, supabase-js as error.details) — the same convention 0130 chose.
-- ERRCODE 42501 maps to HTTP 403, not 500.
-- REQUIRED CLIENT STEP (separate task, deliberately not implemented here):
-- read users.status, replace the publish/response/review entry points with an
-- explicit suspended state, and route the user to the support contact named in
-- app/legal/privacy.tsx.
--
-- INERT AT APPLY TIME: production currently has zero non-active accounts
-- (verified read-only, 2026-08-30), so on the day this lands nothing changes for
-- anyone. It only ever acts after a moderator acts.

BEGIN;

DO $guard$
DECLARE
  v_missing text;
  v_definition text;
  v_owner text;
  v_secdef boolean;
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

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'suspension_enforcement_api_roles_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'suspension_enforcement_definer_owner_must_not_be_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  -- (4) DEPENDENCY ON THE APPLIED 0130, and identity of what was found.
  --
  -- The status lock below authorises a moderator by reading users.is_admin. If
  -- that column were still self-settable, a suspended user would promote
  -- themselves and then clear their own suspension, and this whole file would be
  -- decoration. So the 0130 guard is a hard precondition.
  --
  -- Its EXISTENCE is now the normal state, not a collision — the previous
  -- revision of this draft created a function of the same name and its guard
  -- would now abort for the wrong reason. What must still be rejected is a
  -- FOREIGN object that merely shares the name. It is identified positively:
  -- right signature, returns trigger, SECURITY INVOKER, owned by a non-API role,
  -- body actually mentions is_admin, and an enabled BEFORE UPDATE trigger on
  -- public.users that calls it.
  IF to_regprocedure('public.guard_user_privilege_columns()') IS NULL THEN
    RAISE EXCEPTION 'suspension_enforcement_requires_is_admin_guard'
      USING ERRCODE = 'P0001',
            HINT = 'Apply supabase/migrations/0130_guard_user_privilege_columns.sql first. Without the is_admin lock a suspended user promotes themselves to moderator and clears their own suspension, and the status lock added here is bypassable.';
  END IF;

  SELECT pg_get_functiondef(function_row.oid),
         owner_role.rolname,
         function_row.prosecdef
  INTO v_definition, v_owner, v_secdef
  FROM pg_proc AS function_row
  JOIN pg_roles AS owner_role ON owner_role.oid = function_row.proowner
  WHERE function_row.oid = to_regprocedure('public.guard_user_privilege_columns()');

  IF v_secdef
     OR v_owner IN ('anon', 'authenticated', 'service_role', 'authenticator')
     OR v_definition !~* '\mis_admin\M'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_proc AS function_row
       WHERE function_row.oid = to_regprocedure('public.guard_user_privilege_columns()')
         AND function_row.prorettype = 'pg_catalog.trigger'::regtype
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
       JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgenabled <> 'D'
         AND schema_row.nspname = 'public'
         AND table_row.relname = 'users'
         AND trigger_row.tgfoid = to_regprocedure('public.guard_user_privilege_columns()')
     ) THEN
    RAISE EXCEPTION 'suspension_enforcement_foreign_privilege_guard_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'public.guard_user_privilege_columns() exists but is not the guard migration 0130 installed (expected SECURITY INVOKER, owned by a non-API role, returning trigger, mentioning is_admin, and reached by an enabled trigger on public.users). Inventory the live object and decide explicitly.';
  END IF;

  -- (5) Name collision for the objects THIS file creates.
  IF to_regprocedure('public.guard_content_author_active()') IS NOT NULL
     OR to_regprocedure('public.guard_user_status_column()') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname IN (
           'orders_author_active_guard',
           'order_responses_author_active_guard',
           'reviews_author_active_guard',
           'users_guard_status_column'
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
-- must succeed identically for a PostgREST write and for a SECURITY DEFINER RPC.
-- Reading the actor's row through the caller's RLS would make the answer depend
-- on a policy set this migration does not own.
--
-- The actor is auth.uid(), NOT the row owner column, and NOT current_user.
-- auth.uid() reads the per-request JWT claim, which stays correct inside
-- SECURITY DEFINER functions — that is precisely how this guard reaches
-- submit_master_review, which runs as postgres. It is NULL for cron, migrations
-- and service_role, and those paths must keep working.
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
      RAISE EXCEPTION 'Аккаунт ограничен: изменить текст, фото и размещение публикации нельзя. Обратитесь в поддержку.'
        USING ERRCODE = '42501', DETAIL = 'account_not_active';
    END IF;
  END LOOP;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_content_author_active() IS
  'Blocks creation of user-generated content, and edits to the content columns named in TG_ARGV, while the acting account (auth.uid()) is not active. Runs for every writer including SECURITY DEFINER RPCs such as submit_master_review, which is not subject to reviews RLS; steps aside when there is no JWT identity (cron, service_role, migrations).';

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
-- Companion to 0130, never a replacement: that migration locks is_admin and
-- is_demo, this one locks status, and neither touches the other's column.
--
-- SECURITY INVOKER and the `current_user = 'postgres'` escape are copied from
-- 0130 on purpose. Two guards on the same table with different escape rules
-- would be a trap for the next reader, and the narrow rule is the fail-closed
-- one. Consequences, stated rather than discovered:
--   * SECURITY DEFINER RPCs owned by postgres pass — verified live for
--     delete_my_account(), which sets status = 'deleted' and must keep working;
--   * service_role does NOT pass. Nothing writes users.status as service_role
--     today (the admin screen uses the operator's own session), and the web
--     panel contract in docs/ADMIN_PANEL.md §6 deliberately keeps service_role
--     out of the browser and moderates through PostgREST as `authenticated`.
--     If a server-side moderation job is ever built, it gets an explicit,
--     separately reviewed SECURITY DEFINER RPC — not a widened escape here.
--
-- The admin lookup runs under the caller's own RLS. Verified live: the SELECT
-- policy on public.users is users_select_all USING (true), so the read always
-- succeeds; and if it ever stopped succeeding the result would be NULL, which
-- COALESCE reads as "not a moderator" — the fail-closed direction.
--
-- INSERT is not guarded, for the same reason 0130 does not guard it: rows are
-- created by the SECURITY DEFINER trigger handle_new_auth_user, and there is no
-- DELETE policy on public.users (verified live — INSERT/SELECT/UPDATE only), so
-- a client cannot drop its row and recreate it pre-cleared.
CREATE FUNCTION public.guard_user_status_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_is_admin boolean;
BEGIN
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT user_row.is_admin INTO v_actor_is_admin
    FROM public.users AS user_row
    WHERE user_row.id = auth.uid();

    IF COALESCE(v_actor_is_admin, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Статус аккаунта меняет только модератор.'
        USING ERRCODE = '42501',
              DETAIL = 'users.status is managed by moderators only';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_user_status_column() IS
  'Companion to guard_user_privilege_columns (migration 0130): that one locks users.is_admin / is_demo, this one locks users.status to moderators. RLS restricts the row, never the column, and authenticated holds UPDATE on users.status, so without this a suspended user lifts their own suspension with a single PATCH.';

REVOKE ALL ON FUNCTION public.guard_user_status_column()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER users_guard_status_column
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_user_status_column();

COMMIT;

-- ---------------------------------------------------------------------------
-- LIVE FINDING THAT BLOCKS THE MODERATION FEATURE, recorded here because this
-- is the file that depends on it
-- ---------------------------------------------------------------------------
-- Read-only inventory of production, 2026-08-30:
--
--   SELECT count(*) FILTER (WHERE is_admin)                AS admins,        -- 1
--          count(*) FILTER (WHERE is_admin AND is_demo)    AS demo_admins,   -- 1
--          count(*) FILTER (WHERE status <> 'active')      AS non_active     -- 0
--   FROM public.users;
--
-- The ONLY administrator in production is a demo account. That is the account
-- docs/ADMIN_PANEL.md §2 flagged, seeded by 0104_admin_demo_account.sql with a
-- password that is in Git history, and which 0094_revoke_admin_from_demo_users.sql
-- was supposed to have stripped. Nothing in this file changes that, and 0130
-- explicitly leaves granting admin to the database owner via psql.
--
-- Consequence for the moderation work: everything gated on users.is_admin —
-- the status lock above, and every capability in 0128_order_moderation.sql — is
-- currently exercisable by whoever reads that password out of Git. Creating a
-- real moderator account and removing admin from the demo account is a
-- prerequisite for 0128, not a follow-up. It is an owner decision and is not
-- performed here.
