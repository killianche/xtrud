-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- See supabase/migration-drafts/README.md.
--
-- 0133_order_picked_master.sql
--
-- GAP Р1 (TASKS.md, этап 3.6): "путь клиента обрывается на главном шаге".
-- The client gets responses, calls somebody, agrees a price — and the product
-- never learns that any of it happened. There is nothing to attach a review to,
-- no funnel, and the master whose response was chosen is told nothing.
--
-- WHAT THIS ADDS: ONE FACT, NOT A LIFECYCLE
--
-- When the owner closes a task with the reason that already exists —
-- `found_master`, written by src/features/orders/use-cancel-order.ts:20 — they
-- may also name WHICH of the responders they went with. That is the entire
-- change. There is no "in progress", no acceptance, no completion, no
-- confirmation, no dispute and no new status: docs/SIMPLE_FLOW.md §4 says those
-- do not exist, and this draft does not bring any of them back. The order still
-- goes to `cancelled`, exactly as today.
--
-- NO NEW COLUMN IS CREATED. public.orders already has picked_master_id (uuid,
-- FK to users, ON DELETE SET NULL, indexed) and picked_at (timestamptz), left
-- over from the removed lifecycle, and the live CHECK constraint
-- orders_picked_only_after_accept already permits picked_master_id while the
-- status is 'cancelled'. Live on 2026-08-30 the pair is set on 13 rows. What the
-- column lacks is not storage, it is meaning: today anything can be written into
-- it, so nothing may be concluded from it.
--
-- WHAT MAKES IT MEAN SOMETHING
--
--   1. It may only be set on a task the owner is closing as found_master.
--   2. It may only name a master who actually responded to THAT task.
--   3. Once set it is final. It may only be cleared by re-opening the task,
--      which is what public.reopen_order already does.
--
-- Rule 2 also subsumes "not yourself": live trigger order_responses_check_not_self
-- refuses a response from the order's own client, so an owner can never be a
-- responder. No separate self-pick rule is added.
--
-- Rule 2 is not paranoia. public.confirm_work_done(...) exists live, is SECURITY
-- DEFINER, has EXECUTE granted to `authenticated`, is reachable from outside as
-- /rest/v1/rpc/confirm_work_done, and stamps picked_master_id on an order with a
-- plain UPDATE that no RLS policy inspects. The local fixture demonstrates it
-- before this draft is applied: a client stamps a master who never saw the task.
-- A BEFORE trigger fires for that RPC as well, because trigger execution does
-- not consult EXECUTE privilege and is not subject to the caller's RLS. An RLS
-- policy here would guard a door the RPC does not use.
--
-- Rule 3 exists because orders_owner_edit_open has USING covering 'cancelled':
-- without it the owner could keep rewriting the answer afterwards, and an anchor
-- that can be moved is not an anchor.
--
-- WHY THE NOTIFICATION FUNCTION IS REPLACED TOO
--
-- Live trigger orders_notify_cancelled_or_expired sends "Клиент отменил заказ"
-- to picked_master_id AND, separately, to every response in status sent/viewed.
-- The moment the client names a responder, that master is in both sets: two
-- identical pushes, both of them saying the client cancelled, to the one person
-- the client actually chose. That is not a cosmetic defect, it is the interface
-- asserting something untrue (.claude/rules/design-quality.md §5), and it is
-- created by this change, so this change fixes it:
--
--   * the chosen master is excluded from the responder loop — one push, not two;
--   * when the reason is found_master, their push says "Клиент выбрал вас".
--     Legacy rows closed for another reason keep the old wording.
--
-- The push payload `type` stays 'order_cancelled'. public.notify_user casts
-- data->>'type' to the enum public.notification_type and silently falls back to
-- 'system' on an unknown label, so inventing a new type here would quietly
-- mislabel the in-app notification row.
--
-- Replacing a live SECURITY DEFINER function is a heavier act than adding a
-- trigger, so it is fenced: the migration refuses to run unless the body it is
-- about to overwrite still hashes to the value read from production on
-- 2026-08-30. If somebody changed it in between, this stops instead of
-- clobbering their work.
--
-- WHAT IS DELIBERATELY NOT DONE
--
--   * Reviews are NOT bound to the order here. That is gap Р2, it needs
--     public.submit_master_review (SECURITY DEFINER, live, no migration file) to
--     change signature, and that is a separate decision with its own client
--     rollout. This draft only creates the anchor Р2 will need.
--   * Naming a master is OPTIONAL. The published client closes tasks without it
--     and must keep working; a task closed as found_master with nobody named
--     stays perfectly valid.
--   * Nothing is claimed about what happens off-platform. picked_master_id
--     records who the client said they chose, not who did the work.
--   * No catalogue, rating, ranking or "closed deals" counter is touched.
--
-- PUBLISHED iOS COMPATIBILITY, MEASURED NOT ASSUMED
--
--   * The close path is a plain PATCH from use-cancel-order.ts. The published
--     client sends status and cancel_reason and never sends picked_master_id, so
--     every existing close keeps succeeding unchanged.
--   * On refusal, app/(details)/orders/[id].tsx:148 renders
--     `Alert.alert("Не удалось закрыть", e.message)` — the RAW server message.
--     The sentences below are what the user reads, which is why they are
--     ordinary Russian and not tokens. The token is in DETAIL.
--   * The reopen button stays functional: clearing picked_master_id is allowed
--     precisely when the order returns to 'open', which is what reopen_order
--     does in the same statement.
--   * ERRCODE 42501 makes PostgREST answer 403 rather than 500.
--
-- REQUIRED CLIENT STEP (separate task, deliberately not implemented here):
-- after "Я нашёл исполнителя" in CloseReasonSheet, let the client pick one of
-- the responders (with a skip), and send picked_master_id in the SAME PATCH as
-- status and cancel_reason. It must be the same statement: the notification
-- trigger is AFTER UPDATE OF status, so a later separate PATCH would set the
-- anchor without ever telling the chosen master.

BEGIN;

DO $guard$
DECLARE
  v_missing text;
  v_md5 text;
BEGIN
  -- (1) Schema presence. Never guess the live shape.
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_responses') IS NULL THEN
    RAISE EXCEPTION 'order_picked_master_schema_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'order_picked_master_auth_uid_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (2) Every column the guard reads or writes must exist. A column that is not
  -- there would compare NULL to NULL and guard nothing at all.
  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO v_missing
  FROM (
    VALUES
      ('orders', 'id'),
      ('orders', 'client_id'),
      ('orders', 'status'),
      ('orders', 'cancel_reason'),
      ('orders', 'picked_master_id'),
      ('orders', 'picked_at'),
      ('order_responses', 'order_id'),
      ('order_responses', 'master_id')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS live_column
    WHERE live_column.table_schema = 'public'
      AND live_column.table_name = required.table_name
      AND live_column.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'order_picked_master_columns_require_live_audit: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- (3) The status vocabulary this draft writes into.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS type_row
    JOIN pg_enum AS enum_row ON enum_row.enumtypid = type_row.oid
    JOIN pg_namespace AS schema_row ON schema_row.oid = type_row.typnamespace
    WHERE schema_row.nspname = 'public'
      AND type_row.typname = 'order_status'
      AND enum_row.enumlabel = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'order_picked_master_order_status_enum_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (4) The live CHECK constraint must already allow a picked master on a
  -- cancelled order. If it does not, every close would fail the constraint after
  -- the client change ships, and that must be discovered here, not in the store.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_picked_only_after_accept'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_picked_only_after_accept'
      AND pg_get_constraintdef(oid) LIKE '%''cancelled''::order_status%'
  ) THEN
    RAISE EXCEPTION 'order_picked_master_check_constraint_forbids_cancelled_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'orders_picked_only_after_accept must permit status = cancelled before this draft can be promoted.';
  END IF;

  -- (5) API role names, so "no JWT identity" means what it is assumed to mean.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'order_picked_master_api_roles_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  -- (6) The guard must be created by a role whose SECURITY DEFINER identity is
  -- worth something.
  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'order_picked_master_definer_owner_must_not_be_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  -- (7) Name collision. Nothing here overwrites an object it did not create.
  IF to_regprocedure('public.guard_order_picked_master()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname = 'orders_picked_master_guard'
     ) THEN
    RAISE EXCEPTION 'order_picked_master_object_name_collision_requires_live_audit'
      USING ERRCODE = 'P0001',
            HINT = 'Do not overwrite an object this migration did not create. Inventory the live object and decide explicitly.';
  END IF;

  -- (8) The one object this migration DOES overwrite must still be the body it
  -- was written against. Read read-only from production 2026-08-30:
  --   SELECT md5(prosrc) FROM pg_proc ... proname =
  --     'trg_notify_order_cancelled_or_expired';  -->
  --   2618a640a62ad6259c2213f175830cab
  IF to_regprocedure('public.trg_notify_order_cancelled_or_expired()') IS NULL THEN
    RAISE EXCEPTION 'order_picked_master_notify_function_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT md5(proc_row.prosrc) INTO v_md5
  FROM pg_proc AS proc_row
  JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
  WHERE schema_row.nspname = 'public'
    AND proc_row.proname = 'trg_notify_order_cancelled_or_expired';

  IF v_md5 IS DISTINCT FROM '2618a640a62ad6259c2213f175830cab' THEN
    RAISE EXCEPTION 'order_picked_master_notify_function_diverged_requires_live_audit: %', v_md5
      USING ERRCODE = 'P0001',
            HINT = 'Somebody changed trg_notify_order_cancelled_or_expired after 2026-08-30. Read the live body, merge deliberately, and re-derive this hash.';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- Guard — picked_master_id becomes a fact instead of a free-text field
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER with row_security = off: the "did this master respond?"
-- lookup must give the same answer for a PostgREST write and for a SECURITY
-- DEFINER RPC, and must not depend on order_responses policies this migration
-- does not own.
--
-- Every check is on the TRANSITION, never on the resting state. That is
-- deliberate: live already holds rows this contract would reject if it were
-- applied to them — 2 cancelled orders whose reason is 'stale_no_activity_30d'
-- carry a picked master, and one picked master never responded to the order they
-- are named on. Those rows are history. Freezing them would make ordinary
-- edits, expiry and deletion fail on data nobody can fix.
CREATE FUNCTION public.guard_order_picked_master()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- No JWT identity: cron, migration, service_role, pg_restore. Not a client.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A task is born without an executor. Nothing legitimate creates one that
    -- already has a chosen master, and allowing it would let a caller invent an
    -- anchor for a task that never had a single response.
    IF NEW.picked_master_id IS NOT NULL THEN
      RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
        USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
    END IF;
    RETURN NEW;
  END IF;

  -- Not touching the anchor: none of this guard's business. This is what keeps
  -- legacy rows, expiry, editing and deletion working.
  IF NEW.picked_master_id IS NOT DISTINCT FROM OLD.picked_master_id THEN
    RETURN NEW;
  END IF;

  -- Clearing it. Allowed only as part of putting the task back in the feed,
  -- which is exactly what public.reopen_order does in one statement. Anything
  -- else is an attempt to unpick and re-pick.
  IF NEW.picked_master_id IS NULL THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'Выбранного исполнителя можно убрать только вместе с открытием задания заново.'
        USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
    END IF;
    NEW.picked_at := NULL;
    RETURN NEW;
  END IF;

  -- Replacing one master with another. An anchor that moves is not an anchor.
  IF OLD.picked_master_id IS NOT NULL THEN
    RAISE EXCEPTION 'Исполнителя уже нельзя изменить.'
      USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
  END IF;

  -- Setting it for the first time.
  IF NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
      USING ERRCODE = '42501', DETAIL = 'picked_master_requires_closed_order';
  END IF;

  IF NEW.cancel_reason IS DISTINCT FROM 'found_master' THEN
    RAISE EXCEPTION 'Исполнителя указывают, только когда задание закрывают как «нашёл исполнителя».'
      USING ERRCODE = '42501', DETAIL = 'picked_master_requires_found_master';
  END IF;

  -- There is deliberately NO separate "you cannot pick yourself" rule. Live
  -- trigger order_responses_check_not_self refuses a response from the order's
  -- own client, so an owner can never satisfy the requirement below. A second
  -- rule that can only fire when the first one already did is surface, not
  -- depth; the assertions prove the implication instead of assuming it.
  IF NOT EXISTS (
    SELECT 1 FROM public.order_responses AS response_row
    WHERE response_row.order_id = NEW.id
      AND response_row.master_id = NEW.picked_master_id
  ) THEN
    RAISE EXCEPTION 'Выбрать можно только исполнителя, который откликнулся на это задание.'
      USING ERRCODE = '42501', DETAIL = 'picked_master_must_have_responded';
  END IF;

  -- Stamped by the server, not by the client: the timestamp is evidence, and
  -- evidence a caller can write is not evidence.
  NEW.picked_at := now();
  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.guard_order_picked_master() IS
  'xtrud gap Р1: public.orders.picked_master_id may only be set while closing a task as found_master, only to a master who responded to that task, and only once; it is cleared only by re-opening the task. Checks the transition, never the resting state, so legacy rows stay writable. Fires for every writer including SECURITY DEFINER RPCs such as confirm_work_done.';

REVOKE ALL ON FUNCTION public.guard_order_picked_master()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER orders_picked_master_guard
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_picked_master();

-- ---------------------------------------------------------------------------
-- One honest notification instead of two dishonest ones
-- ---------------------------------------------------------------------------
-- Diff against the live body (md5 2618a640a62ad6259c2213f175830cab), which the
-- preflight above has just verified:
--   * the chosen master's push title becomes "Клиент выбрал вас" when the task
--     was closed as found_master; every other case keeps the old title;
--   * the responder loop skips the chosen master, who was just notified.
-- Nothing else changes: same trigger, same signature, same payload `type`, same
-- withdrawal of outstanding responses.
CREATE OR REPLACE FUNCTION public.trg_notify_order_cancelled_or_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_title text;
  v_resp record;
BEGIN
  IF NEW.status NOT IN ('cancelled', 'expired')
     OR COALESCE(OLD.status::text, '') = NEW.status::text THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.status = 'cancelled' THEN 'Клиент отменил заказ'
    WHEN NEW.status = 'expired'   THEN 'Заказ истёк'
  END;

  IF NEW.picked_master_id IS NOT NULL AND NEW.status = 'cancelled' THEN
    PERFORM public.notify_user(
      NEW.picked_master_id,
      CASE WHEN NEW.cancel_reason = 'found_master' THEN 'Клиент выбрал вас' ELSE v_title END,
      LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id)
    );
  END IF;

  FOR v_resp IN
    SELECT id, master_id
    FROM public.order_responses
    WHERE order_id = NEW.id
      AND status IN ('sent', 'viewed')
      AND master_id IS DISTINCT FROM NEW.picked_master_id
  LOOP
    PERFORM public.notify_user(
      v_resp.master_id,
      v_title,
      LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id)
    );
  END LOOP;

  UPDATE public.order_responses
    SET status = 'withdrawn',
        updated_at = now()
    WHERE order_id = NEW.id
      AND status IN ('sent', 'viewed');

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.trg_notify_order_cancelled_or_expired() IS
  'xtrud gap Р1 revision of the live 2026-08-30 body: the chosen master is notified once and, when the task was closed as found_master, is told they were chosen rather than that the client cancelled.';

COMMIT;

-- ---------------------------------------------------------------------------
-- MANDATORY LIVE STEPS BEFORE PROMOTION, not solvable locally
-- ---------------------------------------------------------------------------
-- 1. Re-read md5(prosrc) of trg_notify_order_cancelled_or_expired immediately
--    before applying. The guard above will refuse on a mismatch, but discovering
--    that during a maintenance window is worse than knowing beforehand.
-- 2. Decide explicitly what happens to public.confirm_work_done. After this
--    migration its picked_master_id write is refused for any master who did not
--    respond. Nothing in app/ or src/ calls it (grep, 2026-08-30) and its ad-hoc
--    INSERT branch already fails on the missing column budget_mode, so the
--    expected answer is "drop it in a separate reviewed migration" — but that is
--    a decision, not a side effect of this one.
-- 3. Re-count the legacy rows this guard steps around:
--      SELECT status, cancel_reason, picked_master_id IS NOT NULL, count(*)
--        FROM public.orders GROUP BY 1,2,3;
--    On 2026-08-30: 11 completed with a picked master, 2 cancelled as
--    stale_no_activity_30d with a picked master, 1 cancelled as found_master
--    with none. If that distribution changed, re-read this draft's assumptions.
