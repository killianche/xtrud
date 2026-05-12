-- Migration 0017 — Expo Push: notification_tokens table + pg_net extension.
--
-- Sprint 8.6 — фундамент push-уведомлений.
-- - pg_net позволит DB triggers вызывать edge function `notify`.
-- - notification_tokens хранит Expo push tokens. Одно устройство — одна строка.
-- - При signOut клиент удаляет свой токен. ON DELETE CASCADE удалит при удалении user.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- TABLE: notification_tokens
-- ============================================================================

CREATE TABLE public.notification_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expo_token    text NOT NULL UNIQUE CHECK (length(expo_token) BETWEEN 10 AND 200),
  platform      text NOT NULL CHECK (platform IN ('ios','android','web')),
  device_name   text CHECK (device_name IS NULL OR length(device_name) <= 100),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notification_tokens IS
  'Expo push tokens пользователей. Один user → много устройств. Каждый токен UNIQUE.';

CREATE INDEX notification_tokens_user_id_idx ON public.notification_tokens (user_id);

CREATE TRIGGER notification_tokens_set_updated_at
BEFORE UPDATE ON public.notification_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- RLS — owner-only
-- ============================================================================

ALTER TABLE public.notification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_tokens_select_own ON public.notification_tokens
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY notification_tokens_insert_own ON public.notification_tokens
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY notification_tokens_update_own ON public.notification_tokens
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY notification_tokens_delete_own ON public.notification_tokens
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
