-- start_chat_with_master теперь вставляет welcome-message от мастера с его
-- откликом (цена + срок + сообщение) при первом создании chat'а. Чтобы
-- INSERT messages работал от чужого имени (sender_id = master_id, а caller
-- = client) — SET row_security = off внутри SECURITY DEFINER функции.
--
-- Цены форматируются через replace(to_char, ',', ' ') — русская типографика
-- (пробел как тысячный разделитель, не запятая).
--
-- Backfill: для chat'ов созданных ДО — INSERT welcome для каждого пустого.

CREATE OR REPLACE FUNCTION public.start_chat_with_master(
  p_order_id uuid, p_master_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_client_id uuid;
  v_chat_id uuid;
  v_response public.order_responses%ROWTYPE;
  v_welcome text;
  v_price_text text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT client_id INTO v_client_id FROM public.orders WHERE id = p_order_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_client_id <> v_caller THEN
    RAISE EXCEPTION 'Forbidden: only order owner can start chat' USING ERRCODE = '42501';
  END IF;
  IF v_client_id = p_master_id THEN
    RAISE EXCEPTION 'client and master must differ' USING ERRCODE = '23514';
  END IF;
  SELECT id INTO v_chat_id FROM public.chats
  WHERE order_id = p_order_id AND master_id = p_master_id;
  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;
  INSERT INTO public.chats (order_id, client_id, master_id)
  VALUES (p_order_id, v_client_id, p_master_id) RETURNING id INTO v_chat_id;
  SELECT * INTO v_response FROM public.order_responses
  WHERE order_id = p_order_id AND master_id = p_master_id
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    v_price_text := CASE
      WHEN v_response.price_mode = 'negotiable' THEN 'Цена договорная'
      WHEN v_response.price_mode = 'exact' AND v_response.price_min IS NOT NULL
        THEN replace(to_char(v_response.price_min, 'FM999G999G999'), ',', ' ') || ' ₽'
      WHEN v_response.price_mode = 'range' THEN
        CASE
          WHEN v_response.price_min IS NOT NULL AND v_response.price_max IS NOT NULL
            THEN replace(to_char(v_response.price_min, 'FM999G999G999'), ',', ' ') || ' – ' ||
                 replace(to_char(v_response.price_max, 'FM999G999G999'), ',', ' ') || ' ₽'
          WHEN v_response.price_min IS NOT NULL
            THEN 'от ' || replace(to_char(v_response.price_min, 'FM999G999G999'), ',', ' ') || ' ₽'
          WHEN v_response.price_max IS NOT NULL
            THEN 'до ' || replace(to_char(v_response.price_max, 'FM999G999G999'), ',', ' ') || ' ₽'
          ELSE 'Цена договорная'
        END
      ELSE 'Цена договорная'
    END;
    v_welcome := 'Мой отклик: ' || v_price_text;
    IF v_response.lead_time IS NOT NULL AND length(trim(v_response.lead_time)) > 0 THEN
      v_welcome := v_welcome || E'\nСрок: ' || v_response.lead_time;
    END IF;
    IF v_response.message IS NOT NULL AND length(trim(v_response.message)) > 0 THEN
      v_welcome := v_welcome || E'\n\n' || v_response.message;
    END IF;
    INSERT INTO public.messages (chat_id, sender_id, text, created_at)
    VALUES (v_chat_id, p_master_id, v_welcome, now());
  END IF;
  RETURN v_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_chat_with_master(uuid, uuid) TO authenticated;
