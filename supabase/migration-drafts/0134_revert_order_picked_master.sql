-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
--
-- 0134_revert_order_picked_master.sql
--
-- Rollback for 0133_order_picked_master.sql (gap Р1).
--
-- 0133 does two things, and this file undoes both:
--   1. drops the guard trigger and function — picked_master_id goes back to
--      being a column anything may write;
--   2. restores public.trg_notify_order_cancelled_or_expired to the exact live
--      body of 2026-08-30, byte for byte, including its original COMMENT.
--
-- No column, constraint, policy or grant was created by 0133, and no row was
-- rewritten, so nothing here can lose data. Anchors already recorded in
-- picked_master_id survive the rollback; they simply stop being protected, and
-- a chosen master starts receiving the duplicate "Клиент отменил заказ" push
-- again. That is the honest cost of rolling back, stated so it is a decision
-- rather than a surprise.
--
-- The revert refuses to run if it would delete or overwrite an object it did
-- not create.

BEGIN;

DO $guard$
DECLARE
  v_comment text;
BEGIN
  IF to_regprocedure('public.guard_order_picked_master()') IS NULL THEN
    RAISE NOTICE 'order_picked_master_revert: the guard is not present';
  ELSE
    SELECT obj_description(to_regprocedure('public.guard_order_picked_master()'), 'pg_proc')
    INTO v_comment;

    IF v_comment IS NULL OR v_comment NOT LIKE 'xtrud gap Р1:%' THEN
      RAISE EXCEPTION 'order_picked_master_revert_refuses_foreign_object'
        USING ERRCODE = 'P0001',
              DETAIL = 'public.guard_order_picked_master() is not the function 0133 created.',
              HINT = 'Inventory the live object read-only and decide explicitly; do not drop it blind.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_row
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgname = 'orders_picked_master_guard'
        AND trigger_row.tgrelid = 'public.orders'::regclass
        AND trigger_row.tgfoid = to_regprocedure('public.guard_order_picked_master()')
    ) THEN
      RAISE EXCEPTION 'order_picked_master_revert_trigger_mismatch'
        USING ERRCODE = 'P0001',
              DETAIL = 'orders_picked_master_guard is missing or points at another function.';
    END IF;
  END IF;

  -- The notification function must still be the revision 0133 installed. If
  -- somebody edited it afterwards, restoring the 2026-08-30 body would silently
  -- destroy their change.
  SELECT obj_description(to_regprocedure('public.trg_notify_order_cancelled_or_expired()'), 'pg_proc')
  INTO v_comment;

  IF v_comment IS NULL OR v_comment NOT LIKE 'xtrud gap Р1 revision%' THEN
    RAISE EXCEPTION 'order_picked_master_revert_notify_function_not_ours'
      USING ERRCODE = 'P0001',
            DETAIL = 'public.trg_notify_order_cancelled_or_expired() is not the revision 0133 installed.',
            HINT = 'Read the live body, decide what to keep, and restore it deliberately.';
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS orders_picked_master_guard ON public.orders;
DROP FUNCTION IF EXISTS public.guard_order_picked_master();

-- The pre-0133 live body, restored verbatim. Its md5 is asserted below, so a
-- transcription error cannot pass as a rollback.
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
      v_title,
      LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id)
    );
  END IF;

  FOR v_resp IN
    SELECT id, master_id
    FROM public.order_responses
    WHERE order_id = NEW.id
      AND status IN ('sent', 'viewed')
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
  'Sprint 26: при cancel/expire заказа — push мастерам с активными откликами + withdraw их откликов + push picked_master при cancel из in_progress.';

DO $verify$
DECLARE
  v_md5 text;
BEGIN
  IF to_regprocedure('public.guard_order_picked_master()') IS NOT NULL THEN
    RAISE EXCEPTION 'order_picked_master_revert_incomplete' USING ERRCODE = 'P0001';
  END IF;

  SELECT md5(proc_row.prosrc) INTO v_md5
  FROM pg_proc AS proc_row
  JOIN pg_namespace AS schema_row ON schema_row.oid = proc_row.pronamespace
  WHERE schema_row.nspname = 'public'
    AND proc_row.proname = 'trg_notify_order_cancelled_or_expired';

  IF v_md5 IS DISTINCT FROM '2618a640a62ad6259c2213f175830cab' THEN
    RAISE EXCEPTION 'order_picked_master_revert_notify_body_mismatch: %', v_md5
      USING ERRCODE = 'P0001',
            DETAIL = 'The restored body is not byte-identical to the 2026-08-30 live body.';
  END IF;

  RAISE NOTICE 'order_picked_master_revert: picked_master_id is unguarded again and the original notification body is restored';
END
$verify$;

COMMIT;
