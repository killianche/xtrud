-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- See supabase/migration-drafts/README.md.
--
-- 0131_order_publish_limit.sql
--
-- GAP Р4 (TASKS.md, этап 3.6): "нет серверного лимита на публикацию, при этом
-- каждая вставка заказа рассылает push всем подходящим мастерам".
--
-- WHAT IS TRUE TODAY, MEASURED
--
--   * src/features/orders/order-publish-capacity.ts holds MAX_ACTIVE_ORDERS = 3
--     and its own header says the module "deliberately does not claim to enforce
--     the quota". The count is repeated twice on the client
--     (app/(details)/orders/new.tsx:377 and use-create-order.ts:53) and never
--     once on the server.
--   * public.orders carries AFTER INSERT trigger orders_notify_masters_on_insert
--     (0090). One accepted INSERT fans a push out to every master matching the
--     category and city. Nothing can recall that fan-out.
--   * The local fixture demonstrates the consequence before this draft is
--     applied: ten INSERTs in a row are accepted and produce thirty pushes.
--
-- WHY AN INSERT-ONLY LIMIT WOULD BE DECORATION
--
-- public.reopen_order(uuid) exists live, is SECURITY DEFINER, has EXECUTE
-- granted to `authenticated`, and moves a cancelled or expired order back to
-- 'open' with no capacity check. It is reachable from outside as
-- /rest/v1/rpc/reopen_order. A guard that only fires on INSERT is walked around
-- with one UPDATE — the same bypass class proven in the user-blocking work
-- (0124) and in the suspension work (0126). This guard therefore fires on every
-- transition INTO 'open', whoever performs it, including SECURITY DEFINER RPCs.
-- A BEFORE trigger runs for the RPC too, because trigger execution does not
-- consult EXECUTE privilege and is not subject to the caller's RLS.
--
-- THE TWO NUMBERS, AND WHY NEITHER IS NEW
--
-- No new product number is invented here; both already ship.
--
--   3 concurrently open orders per client — this is MAX_ACTIVE_ORDERS from
--     src/features/orders/order-publish-capacity.ts. It is already rendered to
--     the user by src/features/orders/ActiveOrdersLimitState.tsx ("У вас уже 3
--     активных задания"). The server now enforces exactly what the shipped
--     interface already promises; changing the number would make the published
--     client lie, so it is not changed.
--
--   5 new tasks per rolling 24 hours per client — this is the value the product
--     already applies to the other side of the same market: public
--     check_daily_response_limit() caps a master at 5 responses per day (live
--     function, v_limit := 5). Clients and masters get the same daily budget.
--
-- The concurrency cap alone does NOT close Р4: three open orders can be
-- cancelled and republished all evening, and every republication is a fresh
-- fan-out. The rate cap is the half that actually bounds the push blast; the
-- concurrency cap is the half that bounds the feed. Both are needed and neither
-- is a tier, a setting or a per-user exception.
--
-- Window: rolling 24 hours, not a calendar day. check_daily_response_limit uses
-- `created_at::date = (now() AT TIME ZONE 'Europe/Moscow')::date`, which lets
-- ten publications through between 23:59 and 00:01. Same number, tighter window,
-- one extra character of SQL. The divergence from the older function is
-- deliberate and is recorded here rather than copied silently.
--
-- Reality check on the numbers: live production on 2026-08-30 holds 32 orders
-- total, 0 of them open, 54 users, and its busiest day ever was 4 orders across
-- the whole platform. Both caps are far above honest usage and far below what a
-- script needs to be interesting.
--
-- RACE-FREENESS
--
-- Counting rows in READ COMMITTED does not serialise two concurrent publishes:
-- both transactions read 2, both insert, and the client ends with 4 open orders.
-- That is exactly the hole use-order-publish-capacity.ts admits it cannot close.
-- The guard therefore takes a transaction-scoped advisory lock keyed on the
-- client id before it counts. Two publishes by the SAME client serialise; two
-- publishes by different clients never contend, because the key is derived from
-- client_id alone.
--
-- WHAT IS DELIBERATELY NOT RESTRICTED (a cap is not a cage)
--
--   * closing, cancelling, completing, expiring and deleting own orders — the
--     guard returns immediately for any transition that does not enter 'open',
--     so a client at the cap can always get back under it;
--   * editing an order that is already open;
--   * responding, reviewing, reporting, blocking — untouched;
--   * server paths with no JWT identity (cron, service_role, migrations,
--     pg_restore). auth.uid() is NULL there and the guard steps aside, exactly
--     as 0126 does. This is also what keeps a restore of the production dump
--     from failing on its own historical data.
--
-- NOT CLAIMED, and each would need its own decision:
--   * repeated reopen of ONE order re-pings that order's own former responders.
--     It is not a fan-out vector — a fresh order has no responders to ping — and
--     the concurrency cap bounds how many orders can be in flight, but the loop
--     itself is not closed here. Closing it means putting a cooldown inside the
--     live SECURITY DEFINER RPC reopen_order, which is a separate change to a
--     function the published client calls.
--   * per-device, per-IP or per-account-age throttling;
--   * anything about response volume, profile spam or storage uploads.
--
-- PUBLISHED iOS COMPATIBILITY, MEASURED NOT ASSUMED
--
--   * Publish path. src/features/orders/order-publish-error.ts returns a FIXED
--     string for every server rejection — "Сервер отклонил публикацию. Проверьте
--     вход в аккаунт и повторите попытку." The raw server message never reaches
--     the publish screen, so the wording below cannot help there, and the advice
--     the user does see is wrong for a quota. The ordinary path almost never
--     reaches it: the client pre-checks the same 3-open rule twice and shows its
--     own ActiveOrdersLimitState screen instead. The genuinely new rejection is
--     the 24-hour cap, and the honest description of 1.0.x is "the sixth task in
--     a day fails with misleading advice", not "the user is informed".
--   * Reopen path. app/(details)/orders/[id].tsx:207-209 renders
--     `Alert.alert("Не удалось открыть заново", e.message)` — the RAW server
--     message. The Russian sentences below are what a user actually reads there.
--   * ERRCODE 42501 makes PostgREST answer 403, not 500, so a rejection is not
--     reported to Sentry as a server fault. The client has no global 403 →
--     signOut handler (checked in src/lib/supabase.ts and src/lib/auth.ts), so a
--     403 cannot log anybody out.
--   * The machine-readable token lives in DETAIL, which PostgREST surfaces as
--     `details` and supabase-js as error.details. The token for the concurrency
--     cap is deliberately `active_order_limit_reached`, the exact string already
--     used by ActiveOrderLimitError.code in
--     src/features/orders/order-publish-capacity.ts, so the future client maps
--     the server refusal onto the screen it already has.
--
-- REQUIRED CLIENT STEP (separate task, deliberately not implemented here):
-- map DETAIL='active_order_limit_reached' onto the existing
-- ActiveOrdersLimitState screen and DETAIL='daily_order_limit_reached' onto a
-- plain "попробуйте позже" state, instead of the fixed publish-failure string.

BEGIN;

DO $guard$
DECLARE
  v_missing text;
  v_over_open int;
  v_over_rate int;
BEGIN
  -- (1) Schema presence. Never guess the live shape.
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'order_publish_limit_schema_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'order_publish_limit_auth_uid_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (2) Every column the guard reads must exist. A missing column would make
  -- the counts silently wrong rather than loudly absent.
  SELECT string_agg(format('%I', required.column_name), ', ')
  INTO v_missing
  FROM (VALUES ('id'), ('client_id'), ('status'), ('created_at')) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS live_column
    WHERE live_column.table_schema = 'public'
      AND live_column.table_name = 'orders'
      AND live_column.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'order_publish_limit_columns_require_live_audit: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- (3) The status vocabulary. Everything here hinges on the label 'open'.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS type_row
    JOIN pg_enum AS enum_row ON enum_row.enumtypid = type_row.oid
    JOIN pg_namespace AS schema_row ON schema_row.oid = type_row.typnamespace
    WHERE schema_row.nspname = 'public'
      AND type_row.typname = 'order_status'
      AND enum_row.enumlabel = 'open'
  ) THEN
    RAISE EXCEPTION 'order_publish_limit_order_status_enum_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (4) The locking primitives the race-freeness claim depends on.
  IF to_regprocedure('pg_catalog.pg_advisory_xact_lock(bigint)') IS NULL
     OR to_regprocedure('pg_catalog.hashtextextended(text, bigint)') IS NULL THEN
    RAISE EXCEPTION 'order_publish_limit_advisory_lock_primitives_missing'
      USING ERRCODE = 'P0001';
  END IF;

  -- (5) API role names, so "no JWT identity" means what it is assumed to mean.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'order_publish_limit_api_roles_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (6) The guard must be created by a role whose SECURITY DEFINER identity is
  -- worth something.
  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'order_publish_limit_definer_owner_must_not_be_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  -- (7) Name collision. Nothing here overwrites an object it did not create.
  IF to_regprocedure('public.guard_order_publication_limit()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname = 'orders_publication_limit_guard'
     ) THEN
    RAISE EXCEPTION 'order_publish_limit_object_name_collision_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'Do not overwrite an object this migration did not create. Inventory the live object and decide explicitly.';
  END IF;

  -- (8) Report, do not hide, any account the new caps would already find over
  -- the line. Existing rows are never rewritten: such an account simply cannot
  -- publish again until it is back under the cap. Promotion must see the number
  -- rather than discover it from a support ticket.
  SELECT count(*) INTO v_over_open FROM (
    SELECT client_id FROM public.orders WHERE status = 'open'
    GROUP BY client_id HAVING count(*) > 3
  ) AS over_open;

  SELECT count(*) INTO v_over_rate FROM (
    SELECT client_id FROM public.orders WHERE created_at > now() - interval '24 hours'
    GROUP BY client_id HAVING count(*) > 5
  ) AS over_rate;

  RAISE NOTICE 'order_publish_limit: % account(s) currently above the 3-open cap, % above the 24h cap',
    v_over_open, v_over_rate;
END
$guard$;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER with row_security = off is load-bearing: the count must be
-- the same number for a PostgREST write and for a SECURITY DEFINER RPC, and it
-- must not depend on a policy set this migration does not own.
--
-- The actor is auth.uid(), not the row owner column, for the same reason as in
-- 0126: it reads the per-request JWT claim, stays correct inside SECURITY
-- DEFINER functions, and is NULL for cron, migrations, service_role and restore.
-- The counts, however, are keyed on NEW.client_id, because that is whose feed
-- and whose fan-out is being bounded.
CREATE FUNCTION public.guard_order_publication_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
DECLARE
  -- src/features/orders/order-publish-capacity.ts: MAX_ACTIVE_ORDERS = 3.
  v_max_open      constant int := 3;
  -- public.check_daily_response_limit(): v_limit := 5, the master-side budget.
  v_max_per_day   constant int := 5;
  v_actor         uuid := auth.uid();
  v_entering_open boolean;
  v_count         bigint;
BEGIN
  -- No JWT identity: cron, migration, service_role, pg_restore. Not a client.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  v_entering_open :=
    (TG_OP = 'INSERT' AND NEW.status = 'open')
    OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');

  -- An UPDATE that does not put the order into the feed is none of this guard's
  -- business. Closing, cancelling, completing and editing must never be blocked,
  -- or a client at the cap would be trapped above it.
  IF TG_OP = 'UPDATE' AND NOT v_entering_open THEN
    RETURN NEW;
  END IF;

  -- Serialise this client's publications for the rest of the transaction. Two
  -- devices racing now queue instead of both reading a stale count. Different
  -- clients hash to different keys and never contend.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));

  IF v_entering_open THEN
    SELECT count(*) INTO v_count
    FROM public.orders AS order_row
    WHERE order_row.client_id = NEW.client_id
      AND order_row.status = 'open'
      AND order_row.id IS DISTINCT FROM NEW.id;

    IF v_count >= v_max_open THEN
      RAISE EXCEPTION
        'У вас уже % открытых заданий. Закройте одно, чтобы опубликовать новое.', v_max_open
        USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
    END IF;
  END IF;

  -- The rate cap counts creation, whatever status the row is created in: a task
  -- created as a draft and flipped to open is still a task created. Re-opening
  -- an existing order does not create one, which is why this half runs on INSERT
  -- only and the concurrency cap above is what bounds the reopen path.
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_count
    FROM public.orders AS order_row
    WHERE order_row.client_id = NEW.client_id
      AND order_row.created_at > now() - interval '24 hours';

    IF v_count >= v_max_per_day THEN
      RAISE EXCEPTION
        'За последние сутки вы опубликовали % заданий. Следующее можно опубликовать позже.', v_max_per_day
        USING ERRCODE = '42501', DETAIL = 'daily_order_limit_reached';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_order_publication_limit() IS
  'xtrud gap Р4: caps a client at 3 concurrently open orders and 5 newly created orders per rolling 24 hours, race-free through a per-client advisory transaction lock. Fires for every writer including SECURITY DEFINER RPCs such as reopen_order; steps aside when there is no JWT identity (cron, service_role, migrations, restore).';

REVOKE ALL ON FUNCTION public.guard_order_publication_limit()
  FROM PUBLIC, anon, authenticated, service_role;

-- BEFORE INSERT OR UPDATE without a column list, on purpose. `UPDATE OF status`
-- fires only when the column is named in the SET list; that is true of every
-- path known today, but "known today" is not a guarantee, and the guard returns
-- immediately for any update that does not enter 'open'.
CREATE TRIGGER orders_publication_limit_guard
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_publication_limit();

COMMIT;

-- ---------------------------------------------------------------------------
-- MANDATORY LIVE STEP BEFORE PROMOTION, not solvable locally
-- ---------------------------------------------------------------------------
-- 1. Re-read the two counts the preflight NOTICE prints on the real database.
--    An account already above a cap keeps its orders and simply cannot publish
--    again until it is back under; confirm that is acceptable for every such
--    account before applying, because this migration will not tell them why.
-- 2. Confirm read-only that no other automated INSERT into public.orders runs
--    with a JWT identity. Anything that does is now capped like a person:
--      SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n
--        ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.prosrc ILIKE '%INSERT INTO public.orders%';
--    On 2026-08-30 that returned exactly one function, public.confirm_work_done,
--    whose INSERT branch already fails at runtime on a column (budget_mode) that
--    public.orders does not have.
