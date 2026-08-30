-- Migration 0026 — push мастерам при cancel / expire заказа.
-- Закрывает known gap из docs/order-states.md «Side effect на T2 с активными откликами».
--
-- Поведение:
--  При transition orders.status → 'cancelled':
--   1. picked_master_id (если есть, T6) получает «Клиент отменил заказ».
--   2. Все мастера с активным откликом (status IN ('sent','viewed'))
--      получают «Клиент отменил заказ».
--   3. Их отклики → 'withdrawn' (накопившиеся sent-отклики не висят).
--
--  При transition orders.status → 'expired' (cron):
--   1. Все мастера с активным откликом получают «Заказ истёк».
--   2. Их отклики → 'withdrawn'.
--
-- НЕ трогаем accepted-отклики — это история, ratings/reviews опираются.

CREATE OR REPLACE FUNCTION public.trg_notify_order_cancelled_or_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text;
  v_resp record;
BEGIN
  -- Только реальные transition'ы, не любой UPDATE при уже cancelled/expired.
  IF NEW.status NOT IN ('cancelled', 'expired')
     OR COALESCE(OLD.status::text, '') = NEW.status::text THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.status = 'cancelled' THEN 'Клиент отменил заказ'
    WHEN NEW.status = 'expired'   THEN 'Заказ истёк'
  END;

  -- 1. Если был picked_master (T6: in_progress → cancelled) — уведомляем его.
  --    На T7 (expired) picked_master_id IS NULL по constraint orders_picked_only_if_in_progress.
  IF NEW.picked_master_id IS NOT NULL AND NEW.status = 'cancelled' THEN
    PERFORM public.notify_user(
      NEW.picked_master_id,
      v_title,
      LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id)
    );
  END IF;

  -- 2. Все активные responders (sent / viewed) — push + withdraw.
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

  -- 3. Withdraw накопившихся откликов (атомарно с push'ами в одной транзакции).
  UPDATE public.order_responses
    SET status = 'withdrawn',
        updated_at = now()
    WHERE order_id = NEW.id
      AND status IN ('sent', 'viewed');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_notify_order_cancelled_or_expired IS
  'Sprint 26: при cancel/expire заказа — push мастерам с активными откликами + withdraw их откликов + push picked_master при cancel из in_progress.';

REVOKE EXECUTE ON FUNCTION public.trg_notify_order_cancelled_or_expired() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_notify_order_cancelled_or_expired() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_notify_order_cancelled_or_expired() FROM authenticated;

DROP TRIGGER IF EXISTS orders_notify_cancelled_or_expired ON public.orders;
CREATE TRIGGER orders_notify_cancelled_or_expired
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_cancelled_or_expired();
