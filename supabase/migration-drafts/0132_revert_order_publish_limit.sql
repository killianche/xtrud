-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
--
-- 0132_revert_order_publish_limit.sql
--
-- Rollback for 0131_order_publish_limit.sql (gap Р4).
--
-- 0131 is purely additive: one function and one trigger, no column, no policy,
-- no grant, no data rewrite. Rolling it back therefore restores the previous
-- behaviour exactly, and cannot lose anything — which is the whole reason the
-- limit was built as a trigger rather than as a constraint or a column.
--
-- What rolling back means, stated plainly: the server stops enforcing any
-- publication limit, and one script can again fill the region with tasks and
-- push notifications in an evening. Do it when the guard is wrong, not when it
-- is inconvenient.
--
-- The revert refuses to run if it would delete an object it did not create.

BEGIN;

DO $guard$
DECLARE
  v_comment text;
BEGIN
  IF to_regprocedure('public.guard_order_publication_limit()') IS NULL THEN
    RAISE NOTICE 'order_publish_limit_revert: nothing to do, the guard is not present';
    RETURN;
  END IF;

  SELECT obj_description(to_regprocedure('public.guard_order_publication_limit()'), 'pg_proc')
  INTO v_comment;

  IF v_comment IS NULL OR v_comment NOT LIKE 'xtrud gap Р4:%' THEN
    RAISE EXCEPTION 'order_publish_limit_revert_refuses_foreign_object'
      USING ERRCODE = 'P0001',
            DETAIL = 'public.guard_order_publication_limit() is not the function 0131 created.',
            HINT = 'Inventory the live object read-only and decide explicitly; do not drop it blind.';
  END IF;

  -- The trigger must be the one 0131 attached, on the table 0131 attached it to.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'orders_publication_limit_guard'
      AND trigger_row.tgrelid = 'public.orders'::regclass
      AND trigger_row.tgfoid = to_regprocedure('public.guard_order_publication_limit()')
  ) THEN
    RAISE EXCEPTION 'order_publish_limit_revert_trigger_mismatch'
      USING ERRCODE = 'P0001',
            DETAIL = 'orders_publication_limit_guard is missing or points at another function.';
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS orders_publication_limit_guard ON public.orders;
DROP FUNCTION IF EXISTS public.guard_order_publication_limit();

DO $verify$
BEGIN
  IF to_regprocedure('public.guard_order_publication_limit()') IS NOT NULL THEN
    RAISE EXCEPTION 'order_publish_limit_revert_incomplete' USING ERRCODE = 'P0001';
  END IF;
  RAISE NOTICE 'order_publish_limit_revert: publication limits are no longer enforced by the database';
END
$verify$;

COMMIT;
