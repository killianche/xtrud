-- Migration 0021 — отслеживание непрочитанных сообщений в чатах.
--
-- Sprint 12.2: для unread-badge на табе «Чаты».
--
-- Поля per-participant в chats:
--  - last_read_client_at  — когда клиент открывал thread
--  - last_read_master_at  — когда мастер открывал thread
-- NULL = ещё не открывал.
--
-- На клиенте unread определяется так:
--   chat has messages from partner with created_at > last_read_<my_role>_at
--
-- RPC `mark_chat_read(chat_id)` — caller сам вызывает при open thread.
-- Trigger `messages_mark_sender_read` — INSERT message от меня сам обновляет
-- мой last_read_*_at (свои сообщения не считаются unread).
--
-- RLS UPDATE для chats добавлена — оба участника могут писать в свои поля.

-- ============================================================================
-- COLUMNS
-- ============================================================================

ALTER TABLE public.chats
  ADD COLUMN last_read_client_at timestamptz,
  ADD COLUMN last_read_master_at timestamptz;

COMMENT ON COLUMN public.chats.last_read_client_at IS
  'Когда клиент в последний раз открывал thread. NULL = никогда. Sprint 12.2.';
COMMENT ON COLUMN public.chats.last_read_master_at IS
  'Когда мастер в последний раз открывал thread. NULL = никогда. Sprint 12.2.';

-- ============================================================================
-- RLS UPDATE policy — обоим участникам можно обновлять свои last_read_*
-- ============================================================================

CREATE POLICY chats_participant_update ON public.chats
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = client_id OR (SELECT auth.uid()) = master_id
  )
  WITH CHECK (
    (SELECT auth.uid()) = client_id OR (SELECT auth.uid()) = master_id
  );

-- ============================================================================
-- RPC: mark_chat_read — клиент вызывает при open thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_chat_read(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  UPDATE public.chats
    SET
      last_read_client_at =
        CASE WHEN client_id = (SELECT auth.uid()) THEN v_now ELSE last_read_client_at END,
      last_read_master_at =
        CASE WHEN master_id = (SELECT auth.uid()) THEN v_now ELSE last_read_master_at END
    WHERE id = p_chat_id;
END;
$$;

COMMENT ON FUNCTION public.mark_chat_read IS
  'Sprint 12.2: помечает чат прочитанным для текущего auth.uid(). RLS chats_participant_update пропускает UPDATE только если auth.uid() — участник чата.';

-- ============================================================================
-- TRIGGER: при INSERT message от sender — обновить sender'у last_read_*_at
-- (свои сообщения не помечаются как unread)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_mark_sender_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.chats
    SET
      last_read_client_at =
        CASE WHEN client_id = NEW.sender_id THEN NEW.created_at ELSE last_read_client_at END,
      last_read_master_at =
        CASE WHEN master_id = NEW.sender_id THEN NEW.created_at ELSE last_read_master_at END
    WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_mark_sender_read() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_mark_sender_read() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_mark_sender_read() FROM authenticated;

CREATE TRIGGER messages_mark_sender_read
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.trg_mark_sender_read();
