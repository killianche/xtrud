-- Migration 0022 — RPC mark_order_responses_viewed для tab-badge «Заказы».
--
-- Sprint 12.3: клиент видит счётчик новых откликов на свои заказы.
-- При open order detail вызываем эту RPC, она переводит все 'sent' → 'viewed'
-- по этому заказу. Badge = COUNT(*) WHERE order.client_id=me AND status='sent'.
--
-- RLS order_responses_update_own_or_client уже разрешает client UPDATE на
-- responses своих orders — SECURITY INVOKER достаточно.

CREATE OR REPLACE FUNCTION public.mark_order_responses_viewed(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Защита от random'ов: меняем только если caller — владелец заказа.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND client_id = (SELECT auth.uid())
  ) THEN
    RETURN;
  END IF;

  UPDATE public.order_responses
    SET status = 'viewed'
    WHERE order_id = p_order_id AND status = 'sent';
END;
$$;

COMMENT ON FUNCTION public.mark_order_responses_viewed IS
  'Sprint 12.3: клиент помечает все ''sent'' отклики на свой заказ как ''viewed''. Используется для tab-badge счётчика.';
