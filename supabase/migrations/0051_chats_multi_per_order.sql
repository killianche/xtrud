-- На один заказ может быть несколько чатов — по одному с каждым откликнувшимся
-- мастером, чтобы клиент мог задать вопрос ДО выбора. Раньше chats.order_id
-- был UNIQUE — это блокировало multi-master pre-accept conversations.
--
-- Новый constraint: UNIQUE (order_id, master_id) — один chat на пару
-- (заказ, мастер). После accept_response один из этих chat'ов становится
-- «основным» (т.к. order.picked_master_id = master_id того chat'а), но все
-- остальные остаются доступны в истории.

ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_order_id_key;

ALTER TABLE public.chats
  ADD CONSTRAINT chats_order_master_unique UNIQUE (order_id, master_id);

-- RPC: создать или вернуть chat между клиентом и мастером по заказу.
-- Вызывается из master response card → кнопка «Написать».
-- Только client заказа может звать (RLS-friendly через SECURITY DEFINER + check).
CREATE OR REPLACE FUNCTION public.start_chat_with_master(
  p_order_id uuid,
  p_master_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_client_id uuid;
  v_chat_id uuid;
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

  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE order_id = p_order_id AND master_id = p_master_id;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  INSERT INTO public.chats (order_id, client_id, master_id)
  VALUES (p_order_id, v_client_id, p_master_id)
  RETURNING id INTO v_chat_id;

  RETURN v_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_chat_with_master(uuid, uuid) TO authenticated;
