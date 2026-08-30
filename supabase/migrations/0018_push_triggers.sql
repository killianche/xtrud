-- Migration 0018 — Helper function `notify_user` + push triggers.
--
-- Sprint 8.6:
-- - Создаёт vault secret `notify_secret` (используется edge function `notify`
--   и `notify_user` для shared-secret authentication между DB и Edge Runtime).
-- - public.notify_user(user_id, title, body, data) — асинхронный POST через
--   pg_net в edge function. SECURITY DEFINER чтобы триггер мог читать vault.
-- - 3 trigger function'а:
--   * notify_new_message — INSERT на messages → партнёр чата
--   * notify_new_response — INSERT на order_responses → owner заказа
--   * notify_order_accepted — UPDATE на orders (status→in_progress) → picked_master
--
-- Замечание: значение `notify_secret` коммитится в этой миграции в plaintext.
-- Repo private, для MVP это допустимо. Sprint 9+ — ротация через UI Dashboard
-- (UPDATE vault.secrets SET secret = '...' WHERE name = 'notify_secret') и
-- параллельное обновление env var в Edge Functions (если перейдём на env-flow).

-- ============================================================================
-- VAULT SECRET
-- ============================================================================

-- Идемпотентно: создаём только если ещё нет.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_secret') THEN
    PERFORM vault.create_secret(
      '8.6-xtrud-notify-MJ7kPq2RvN9wXcZbTfL5hYuD3sGaE6BoVISkUqAt',
      'notify_secret',
      'Shared secret для вызова edge function notify из DB triggers (Sprint 8.6 MVP).'
    );
  END IF;
END $$;

-- ============================================================================
-- HELPER: public.notify_user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_title   text,
  p_body    text,
  p_data    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE
  v_secret  text;
  v_url     text := 'https://wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/notify';
BEGIN
  -- Не шлём уведомления самому себе и пустым user_id.
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    -- Безопасно проигнорировать: BI чтобы не валить транзакцию пользователя
    -- из-за инфра-проблемы с push.
    RAISE WARNING 'notify_user: notify_secret missing from vault';
    RETURN;
  END IF;

  PERFORM extensions.http_post(
    url := v_url,
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title',   p_title,
      'body',    p_body,
      'data',    COALESCE(p_data, '{}'::jsonb)
    ),
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-notify-secret',  v_secret
    )
  );
END;
$$;

COMMENT ON FUNCTION public.notify_user IS
  'Шлёт push через edge function `notify` асинхронно. Молча игнорирует ошибки чтобы не валить пользовательскую транзакцию.';

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, jsonb) FROM authenticated;

-- ============================================================================
-- TRIGGER: notify_new_message
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient uuid;
  v_sender_name text;
BEGIN
  -- Получатель — другая сторона чата
  SELECT
    CASE WHEN c.client_id = NEW.sender_id THEN c.master_id ELSE c.client_id END
  INTO v_recipient
  FROM public.chats c
  WHERE c.id = NEW.chat_id;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'Новое сообщение')
  INTO v_sender_name
  FROM public.users u WHERE u.id = NEW.sender_id;

  PERFORM public.notify_user(
    v_recipient,
    v_sender_name,
    LEFT(NEW.text, 120),
    jsonb_build_object('type', 'chat_message', 'chat_id', NEW.chat_id)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_notify_new_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_notify_new_message() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_notify_new_message() FROM authenticated;

CREATE TRIGGER messages_notify_recipient
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_new_message();

-- ============================================================================
-- TRIGGER: notify_new_response
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_notify_new_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_id uuid;
  v_order_title text;
BEGIN
  SELECT o.client_id, o.title INTO v_client_id, v_order_title
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_user(
    v_client_id,
    'Новый отклик на заказ',
    LEFT(COALESCE(v_order_title, ''), 120),
    jsonb_build_object('type', 'new_response', 'order_id', NEW.order_id, 'response_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_notify_new_response() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_notify_new_response() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_notify_new_response() FROM authenticated;

CREATE TRIGGER order_responses_notify_owner
AFTER INSERT ON public.order_responses
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_new_response();

-- ============================================================================
-- TRIGGER: notify_order_accepted (клиент выбрал мастера)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_notify_order_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Шлём только при transition status: open → in_progress c picked_master_id.
  IF NEW.status = 'in_progress'
     AND COALESCE(OLD.status::text, '') <> 'in_progress'
     AND NEW.picked_master_id IS NOT NULL THEN
    PERFORM public.notify_user(
      NEW.picked_master_id,
      'Вас выбрали 🎉',
      LEFT(COALESCE(NEW.title, ''), 120),
      jsonb_build_object('type', 'order_accepted', 'order_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_notify_order_accepted() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_notify_order_accepted() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_notify_order_accepted() FROM authenticated;

CREATE TRIGGER orders_notify_picked_master
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_accepted();
