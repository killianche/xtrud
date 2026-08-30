-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Rollback companion of 0126_suspension_enforcement.sql.
--
-- 0127_revert_suspension_enforcement.sql
--
-- Removes exactly the objects 0126 created and nothing else. It touches no
-- policy, no grant, no column and no row: 0126 stores no state, so reverting it
-- is a pure removal of enforcement and every users/orders/order_responses/
-- reviews row is left byte-identical.
--
-- WHAT REVERTING COSTS, stated plainly rather than discovered later:
--   * suspension stops meaning anything again — a suspended account publishes,
--     responds and reviews as before;
--   * public.users.status and public.users.is_admin become client-writable
--     again, so any authenticated user can self-promote and self-unsuspend.
-- If 0128_order_moderation.sql is applied, revert it FIRST: its preflight
-- requires this guard to exist, and moderator capability without the is_admin
-- lock is worse than no moderator capability.

BEGIN;

DO $guard$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'suspension_revert_must_not_run_as_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;

  -- Refuse to run while the order-moderation layer still depends on the
  -- is_admin lock this file removes.
  IF to_regprocedure('public.admin_set_order_hidden(uuid, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'suspension_revert_blocked_by_order_moderation'
      USING ERRCODE = 'P0001',
            HINT = 'Apply 0129_revert_order_moderation.sql first: 0128 relies on public.users.is_admin being server-managed.';
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS orders_author_active_guard ON public.orders;
DROP TRIGGER IF EXISTS order_responses_author_active_guard ON public.order_responses;
DROP TRIGGER IF EXISTS reviews_author_active_guard ON public.reviews;
DROP TRIGGER IF EXISTS users_privilege_columns_guard ON public.users;

DROP FUNCTION IF EXISTS public.guard_content_author_active();
DROP FUNCTION IF EXISTS public.guard_user_privilege_columns();

COMMIT;
