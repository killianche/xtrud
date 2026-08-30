-- Migration 0028 — Notification Center: in-app inbox для уведомлений.
--
-- Сейчас push-уведомления идут через notify_user → pg_net → edge function.
-- Эти push'и эфемерны: если телефон выключен или Expo Push не прошёл —
-- пользователь не узнает что новый отклик есть. In-app inbox решает это:
-- параллельно с push пишем в таблицу `notifications`, юзер видит историю.
--
-- Контракт:
--  - 1:N: каждое событие = 1 строка для recipient'а
--  - RLS: only owner reads/updates (mark read)
--  - INSERT — только через notify_user (security definer), напрямую с клиента нельзя
--  - read_at NULL = непрочитано; UPDATE через RPC mark_notifications_read

CREATE TYPE public.notification_type AS ENUM (
  'new_response',      -- мастер прислал отклик на твой заказ (для клиента)
  'order_accepted',    -- клиент принял твой отклик (для мастера)
  'order_cancelled',   -- клиент отменил заказ (для мастеров с откликами)
  'order_expired',     -- заказ истёк
  'new_message',       -- новое сообщение в чате
  'review_received',   -- получен отзыв
  'system'             -- общее — система / админ
);

CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        public.notification_type NOT NULL,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body        text NOT NULL CHECK (length(body) BETWEEN 0 AND 500),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS
  'Sprint I.1: in-app inbox. Пишется параллельно с push через notify_user. Юзер видит историю даже если push не прошёл.';

CREATE INDEX notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX notifications_user_all_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: только владелец
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- UPDATE: только владелец, только read_at (структурно нельзя ограничить —
-- WITH CHECK блокирует смену user_id чужому, а title/body/data меняем редко).
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- DELETE: владелец может удалить (cleanup своего inbox).
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- INSERT — только через SECURITY DEFINER функции (notify_user). Прямой
-- INSERT клиентом запрещён отсутствием policy.

-- ============================================================================
-- notify_user расширяем — пишем in-app + посылаем push.
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
SET search_path = public, extensions, net, vault, pg_temp
AS $$
DECLARE
  v_secret      text;
  v_url         text := 'https://wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/notify';
  v_type        public.notification_type;
  v_data_type   text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. In-app inbox — пишем всегда (даже если push провалится).
  --    type вытаскиваем из data.type (новое соглашение); fallback = 'system'.
  v_data_type := COALESCE(p_data->>'type', 'system');
  BEGIN
    v_type := v_data_type::public.notification_type;
  EXCEPTION WHEN invalid_text_representation THEN
    v_type := 'system';
  END;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_user_id,
    v_type,
    p_title,
    COALESCE(p_body, ''),
    COALESCE(p_data, '{}'::jsonb)
  );

  -- 2. Push через edge function. Best effort — не валим транзакцию.
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_user: notify_secret missing from vault';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
        'user_id', p_user_id,
        'title',   p_title,
        'body',    p_body,
        'data',    COALESCE(p_data, '{}'::jsonb)
      ),
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-notify-secret', v_secret
      ),
      timeout_milliseconds := 2000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_user: http_post failed: %', SQLERRM;
  END;
END;
$$;

COMMENT ON FUNCTION public.notify_user IS
  'Sprint I.1: пишет in-app notification + асинхронно посылает push. Push best-effort, in-app — всегда.';

-- ============================================================================
-- RPC: mark_notifications_read — пометить N или все как прочитанные.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  IF p_ids IS NULL THEN
    -- Все непрочитанные текущего юзера
    UPDATE public.notifications
      SET read_at = now()
      WHERE user_id = v_user AND read_at IS NULL;
  ELSE
    -- Только указанные id (всё ещё ограничены своими через RLS)
    UPDATE public.notifications
      SET read_at = now()
      WHERE user_id = v_user
        AND id = ANY(p_ids)
        AND read_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

-- ============================================================================
-- Realtime — для live-обновления inbox у текущего юзера.
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
