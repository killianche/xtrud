-- Migration 0011 — таблицы chats и messages для общения client↔master.
--
-- Создаётся 1 чат на 1 заказ автоматически при accept_response.
-- Messages — text-only в sprint 7. Фото/файлы — sprint 8+.
-- Realtime подписка на messages для live-обновления.

-- ============================================================================
-- TABLE: chats
-- ============================================================================

CREATE TABLE public.chats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  master_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chats_client_master_distinct CHECK (client_id != master_id)
);

COMMENT ON TABLE public.chats IS 'Чат client↔master по заказу. 1 чат на 1 заказ (UNIQUE order_id). Создаётся автоматически в accept_response RPC.';

CREATE INDEX chats_client_id_idx ON public.chats (client_id, last_message_at DESC NULLS LAST);
CREATE INDEX chats_master_id_idx ON public.chats (master_id, last_message_at DESC NULLS LAST);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY chats_read_participants ON public.chats
  FOR SELECT USING (
    (SELECT auth.uid()) = client_id OR (SELECT auth.uid()) = master_id
  );

-- INSERT — только через RPC (accept_response сам создаст). Прямой INSERT клиентом нет.
-- UPDATE — нужен для last_message_at, делается через trigger ниже.

-- ============================================================================
-- TABLE: messages
-- ============================================================================

CREATE TABLE public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text        text NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Сообщения чата. Sprint 7 — только text. Sprint 8+ — фото/файлы через storage.';

CREATE INDEX messages_chat_id_created_idx
  ON public.messages (chat_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- SELECT — участники чата
CREATE POLICY messages_read_chat_participants ON public.messages
  FOR SELECT USING (
    (SELECT auth.uid()) IN (
      SELECT client_id FROM public.chats WHERE id = messages.chat_id
      UNION
      SELECT master_id FROM public.chats WHERE id = messages.chat_id
    )
  );

-- INSERT — только sender_id = auth.uid() И участник чата
CREATE POLICY messages_insert_own_in_chat ON public.messages
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND (SELECT auth.uid()) IN (
      SELECT client_id FROM public.chats WHERE id = messages.chat_id
      UNION
      SELECT master_id FROM public.chats WHERE id = messages.chat_id
    )
  );

-- UPDATE — sender может пометить read_at (или удалить контент в будущем)
-- Для sprint 7 — нет UPDATE прав, добавим позже когда понадобится.

-- ============================================================================
-- TRIGGER: обновлять chats.last_message_at при INSERT message
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_chat_last_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.chats
    SET last_message_at = NEW.created_at
    WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_chat_last_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_chat_last_message() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_chat_last_message() FROM authenticated;

CREATE TRIGGER messages_update_chat_last_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.update_chat_last_message();

-- ============================================================================
-- Расширяем accept_response — теперь ещё и чат создаёт
-- ============================================================================

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

  SELECT order_id, master_id INTO v_order_id, v_master_id
  FROM public.order_responses
  WHERE id = p_response_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING errcode = 'P0002';
  END IF;

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

  -- 2. Отклоняем остальные открытые
  UPDATE public.order_responses
    SET status = 'rejected'
    WHERE order_id = v_order_id
      AND id != p_response_id
      AND status IN ('sent', 'viewed');

  -- 3. Order → in_progress
  UPDATE public.orders
    SET status = 'in_progress',
        picked_master_id = v_master_id
    WHERE id = v_order_id;

  -- 4. Создаём чат (если ещё нет)
  INSERT INTO public.chats (order_id, client_id, master_id)
  VALUES (v_order_id, v_user_id, v_master_id)
  ON CONFLICT (order_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_response(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_response(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_response(uuid) TO authenticated;

-- ============================================================================
-- REALTIME — подписка на messages для live-обновления
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
