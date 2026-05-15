-- Денормализованный last_message_text в chats для inbox-preview.
--
-- После Sprint J «Объединить заказы и чаты» список заказов клиента работает
-- как inbox: каждый ряд показывает preview последнего сообщения + время.
-- Без этой денормализации потребовался бы N+1 запрос (по сообщениям каждого
-- чата) или window-функция в RPC. Поле + триггер избавляют от обоих.

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS last_message_text text;

CREATE OR REPLACE FUNCTION public.update_chat_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chats
  SET last_message_text = NEW.text,
      last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_update_chat_last_message ON public.messages;
CREATE TRIGGER trg_messages_update_chat_last_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_last_message();

-- Backfill: заполняем last_message_text последним сообщением каждого чата.
UPDATE public.chats c
SET last_message_text = m.text,
    last_message_at = COALESCE(c.last_message_at, m.created_at)
FROM (
  SELECT DISTINCT ON (chat_id) chat_id, text, created_at
  FROM public.messages
  ORDER BY chat_id, created_at DESC
) m
WHERE m.chat_id = c.id AND (c.last_message_text IS NULL OR c.last_message_text = '');
