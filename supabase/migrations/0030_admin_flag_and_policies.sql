-- Migration 0030 — флаг is_admin + админские RLS policies на reports/reviews/users.
--
-- Sprint I.5. Минимальный admin-режим внутри текущего Expo app (не отдельная
-- админка). Пользователь с users.is_admin=true видит:
--   - Очередь жалоб (reports)
--   - Action: ban/suspend юзера, hide отзыв, dismiss жалобу
-- Действия идут через UPDATE с расширенными RLS.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_admin IS
  'Sprint 30: флаг админ-доступа. Только postgres-role / service_role могут менять (через apply_migration или dashboard).';

CREATE INDEX IF NOT EXISTS users_is_admin_idx ON public.users (is_admin) WHERE is_admin = true;

-- ============================================================================
-- Хелпер: безопасная функция «текущий юзер админ?»
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- ============================================================================
-- Reports — админский SELECT + UPDATE
-- ============================================================================

CREATE POLICY reports_admin_select ON public.reports
  FOR SELECT USING (public.is_current_user_admin());

CREATE POLICY reports_admin_update ON public.reports
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ============================================================================
-- Users — админ может бан/разбан / смену status
-- ============================================================================

CREATE POLICY users_admin_update ON public.users
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ============================================================================
-- Reviews — админ может hide/show (UPDATE status)
-- ============================================================================

CREATE POLICY reviews_admin_update ON public.reviews
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ============================================================================
-- Назначаем главного test-master админом (для UI-обхода)
-- ============================================================================

UPDATE public.users
  SET is_admin = true
  WHERE id = 'f0000002-0000-0000-0000-000000000002';
