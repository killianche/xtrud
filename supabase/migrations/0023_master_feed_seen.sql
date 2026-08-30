-- Migration 0023 — last_seen_feed_at для master-side badge на табе «Заказы».
--
-- Sprint 13.1: мастер видит счётчик новых заявок в feed по своим L2 категориям.
-- Поле в users (per-user marker, удобнее чем отдельная таблица).
-- При открытии /orders tab → mark_feed_seen() обновит it now().
--
-- Badge = COUNT(*) orders WHERE status='open' AND l2_id IN my_l2_ids
--         AND client_id != me AND created_at > last_seen_feed_at.

ALTER TABLE public.users
  ADD COLUMN last_seen_feed_at timestamptz;

COMMENT ON COLUMN public.users.last_seen_feed_at IS
  'Когда мастер в последний раз открывал /orders tab. NULL = ещё не открывал. Sprint 13.1.';

-- ============================================================================
-- RPC: mark_feed_seen — мастер вызывает при mount tab
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_feed_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users
    SET last_seen_feed_at = now()
    WHERE id = (SELECT auth.uid());
END;
$$;

COMMENT ON FUNCTION public.mark_feed_seen IS
  'Sprint 13.1: помечает feed просмотренным для текущего user. Используется master-side для tab-badge.';
