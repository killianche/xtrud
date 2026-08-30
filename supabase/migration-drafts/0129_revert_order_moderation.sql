-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Rollback companion of 0128_order_moderation.sql.
--
-- 0129_revert_order_moderation.sql
--
-- Removes exactly the objects 0128 created, including the two columns.
--
-- FAIL-CLOSED ON LIVE MODERATION STATE. Dropping moderation_hidden_at while any
-- task is hidden would silently republish content a moderator took down — the
-- worst possible outcome of a rollback, and invisible in the migration output.
-- This file therefore ABORTS while any hidden task exists and tells the operator
-- to make that decision explicitly, by unhiding through the RPC (or, with the
-- service key, by clearing the columns) before rolling back. No data is
-- destroyed as a side effect of a rollback.

BEGIN;

DO $guard$
DECLARE
  v_hidden bigint;
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'order_moderation_revert_must_not_run_as_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name = 'moderation_hidden_at'
  ) THEN
    RAISE EXCEPTION 'order_moderation_revert_nothing_to_revert'
      USING ERRCODE = 'P0001',
            HINT = '0128_order_moderation.sql does not appear to be applied here.';
  END IF;

  EXECUTE 'SELECT count(*) FROM public.orders WHERE moderation_hidden_at IS NOT NULL'
  INTO v_hidden;

  IF v_hidden > 0 THEN
    RAISE EXCEPTION 'order_moderation_revert_would_republish_hidden_tasks: %', v_hidden
      USING ERRCODE = 'P0001',
            HINT = 'Unhide every moderated task first (public.admin_set_order_hidden(id, false)), or clear the columns deliberately with the service key. Rolling back must not silently restore content moderation removed.';
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS order_responses_hidden_order_guard ON public.order_responses;
DROP TRIGGER IF EXISTS orders_moderation_columns_guard ON public.orders;

DROP POLICY IF EXISTS orders_admin_select ON public.orders;
DROP POLICY IF EXISTS orders_moderation_hidden_auth_restrictive ON public.orders;
DROP POLICY IF EXISTS orders_moderation_hidden_anon_restrictive ON public.orders;

DROP FUNCTION IF EXISTS public.admin_set_order_hidden(uuid, boolean);
DROP FUNCTION IF EXISTS public.guard_response_target_not_hidden();
DROP FUNCTION IF EXISTS public.guard_order_moderation_columns();

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS moderation_hidden_by,
  DROP COLUMN IF EXISTS moderation_hidden_at;

COMMIT;
