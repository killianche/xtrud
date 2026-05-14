-- 1. RPC reject_response — клиент скрывает отклик (status='rejected').
--    Проверяет права (только client заказа) и состояние (нельзя отклонить
--    уже принятый отклик / отозванный мастером).

CREATE OR REPLACE FUNCTION public.reject_response(p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_order_id uuid;
  v_client_id uuid;
  v_current_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT r.order_id, r.status::text, o.client_id
  INTO v_order_id, v_current_status, v_client_id
  FROM public.order_responses r
  JOIN public.orders o ON o.id = r.order_id
  WHERE r.id = p_response_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Response not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_client_id <> v_caller THEN
    RAISE EXCEPTION 'Forbidden: only client can reject' USING ERRCODE = '42501';
  END IF;
  IF v_current_status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot reject accepted response' USING ERRCODE = '22023';
  END IF;
  IF v_current_status = 'withdrawn' THEN
    RAISE EXCEPTION 'Response already withdrawn by master' USING ERRCODE = '22023';
  END IF;
  UPDATE public.order_responses SET status = 'rejected' WHERE id = p_response_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_response(uuid) TO authenticated;
