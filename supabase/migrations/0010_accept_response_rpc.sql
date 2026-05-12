-- Migration 0010 — RPC accept_response: атомарное принятие отклика мастера.
--
-- Делает 3 вещи в одной транзакции:
-- 1. UPDATE выбранного response SET status='accepted'
-- 2. UPDATE остальных открытых responses этого заказа SET status='rejected'
-- 3. UPDATE order SET status='in_progress', picked_master_id=master_id
--
-- SECURITY INVOKER — RLS уже даёт нужные права (client владелец заказа,
-- может UPDATE и orders, и order_responses через политики).

CREATE OR REPLACE FUNCTION public.accept_response(p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_master_id uuid;
  v_order_client uuid;
  v_order_status public.order_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Найти отклик
  SELECT order_id, master_id INTO v_order_id, v_master_id
  FROM public.order_responses
  WHERE id = p_response_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING errcode = 'P0002';
  END IF;

  -- Проверить, что текущий user — владелец заказа
  SELECT client_id, status INTO v_order_client, v_order_status
  FROM public.orders
  WHERE id = v_order_id;

  IF v_order_client != v_user_id THEN
    RAISE EXCEPTION 'not_order_owner' USING errcode = '42501';
  END IF;

  IF v_order_status != 'open' THEN
    RAISE EXCEPTION 'order_not_open' USING errcode = 'P0001';
  END IF;

  -- 1. Принимаем выбранный отклик
  UPDATE public.order_responses
    SET status = 'accepted'
    WHERE id = p_response_id;

  -- 2. Отклоняем остальные открытые отклики (status='sent' или 'viewed')
  UPDATE public.order_responses
    SET status = 'rejected'
    WHERE order_id = v_order_id
      AND id != p_response_id
      AND status IN ('sent', 'viewed');

  -- 3. Заказ переходит в in_progress + фиксируем мастера
  UPDATE public.orders
    SET status = 'in_progress',
        picked_master_id = v_master_id
    WHERE id = v_order_id;
END;
$$;

COMMENT ON FUNCTION public.accept_response IS 'Клиент принимает отклик мастера: response→accepted, остальные→rejected, order→in_progress+picked_master_id.';

-- GRANTS — только authenticated
REVOKE EXECUTE ON FUNCTION public.accept_response(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_response(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_response(uuid) TO authenticated;
