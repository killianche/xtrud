-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Rollback companion of 0126_suspension_enforcement.sql.
--
-- 0127_revert_suspension_enforcement.sql
--
-- Removes exactly the objects 0126 created and nothing else.
--
-- IT MUST NOT TOUCH THE APPLIED 0130. public.guard_user_privilege_columns() and
-- the trigger users_guard_privilege_columns come from
-- supabase/migrations/0130_guard_user_privilege_columns.sql, which is applied to
-- production and is not this file's to remove. Rolling back the status lock must
-- not also unlock is_admin — that would turn a rollback into a privilege
-- escalation. The guard below asserts 0130 is still standing after the drops,
-- so the mistake cannot pass silently.
--
-- 0126 stores no state, so reverting it is a pure removal of enforcement: every
-- users / orders / order_responses / reviews row is left byte-identical, and the
-- suspensions a moderator recorded are kept as evidence.
--
-- WHAT REVERTING COSTS, stated plainly rather than discovered later:
--   * suspension stops meaning anything again — a suspended account publishes,
--     responds and reviews as before;
--   * public.users.status becomes client-writable again, so any authenticated
--     user can lift their own suspension. is_admin stays locked by 0130.
--
-- 0128_order_moderation.sql does NOT depend on this file: its moderator gate
-- rests on the is_admin lock from 0130, not on anything 0126 creates. The two
-- can therefore be rolled back in either order, and no interlock is imposed
-- between them — an interlock that models a dependency which does not exist is
-- just an obstacle during an incident.

BEGIN;

DO $guard$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'suspension_revert_must_not_run_as_api_role: %', current_user
      USING ERRCODE = 'P0001';
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS orders_author_active_guard ON public.orders;
DROP TRIGGER IF EXISTS order_responses_author_active_guard ON public.order_responses;
DROP TRIGGER IF EXISTS reviews_author_active_guard ON public.reviews;
DROP TRIGGER IF EXISTS users_guard_status_column ON public.users;

DROP FUNCTION IF EXISTS public.guard_content_author_active();
DROP FUNCTION IF EXISTS public.guard_user_status_column();

-- The applied privilege lock must survive this rollback untouched.
DO $preserved$
BEGIN
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
         AND trigger_row.tgname = 'users_guard_privilege_columns'
     ) THEN
    RAISE EXCEPTION 'suspension_revert_removed_the_applied_is_admin_guard'
      USING ERRCODE = 'P0001',
            HINT = 'Rolling back 0126 must leave migration 0130 intact. Abort and restore it before continuing.';
  END IF;
END
$preserved$;

COMMIT;
