-- Migration 0061 — фото-attachments в чате (P0-6).
--
-- Контекст: research/MASTER_ACCOUNT_PLAN.md §P0-6. Без фото в чате клиент
-- не может показать «вот сломанная розетка», «вот размер» — мастер не
-- понимает scope, переспрашивает по 3 раза. Все pro-tools (TaskRabbit,
-- Profi.ru, Thumbtack) поддерживают фото-attachments.
--
-- Что делаем:
--   1. Добавляем messages.image_url text NULL — публичный URL картинки в
--      Supabase Storage bucket 'chat-images'.
--   2. Делаем text nullable (если только фото без текста).
--   3. CHECK: должно быть либо text, либо image_url (хотя бы одно).
--   4. Создаём bucket 'chat-images' (public read для рендера в чате;
--      RLS на upload — только авторизованный, путь = {chat_id}/{filename}).
--
-- Важно: RLS bucket-storage политики проверяют sender, но не валидируют
-- что sender действительно участник этого chat_id (бэкенд-trigger на
-- messages уже проверяет via RLS messages_insert). Storage упрощённо —
-- любой авторизованный может upload в свою папку.

-- ============================================================================
-- COLUMN
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN image_url text NULL;

ALTER TABLE public.messages
  ALTER COLUMN text DROP NOT NULL;

-- text может быть пустым/null если есть image_url. Хотя бы что-то должно
-- быть — иначе пустое сообщение бессмысленно.
ALTER TABLE public.messages
  ADD CONSTRAINT messages_text_or_image_check
  CHECK (
    (text IS NOT NULL AND length(text) > 0)
    OR (image_url IS NOT NULL AND length(image_url) > 0)
  );

COMMENT ON COLUMN public.messages.image_url IS
  'Опц. URL картинки в Supabase Storage bucket chat-images. NULL = только текст. Если задан — клиент рендерит <Image>.';
COMMENT ON COLUMN public.messages.text IS
  'Текст сообщения. NULL допустим только если задан image_url (см. CHECK).';

-- ============================================================================
-- STORAGE bucket + policies
-- ============================================================================

-- Bucket для chat-вложений. public=true → URL открывается без подписи
-- (картинки видны всем, кто знает URL). Это компромисс между UX (быстрая
-- отрисовка) и privacy. Telegram/WhatsApp работают похоже — картинка
-- доступна по URL, но URL содержит уникальный hash, угадать невозможно.
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

-- Любой авторизованный может upload в bucket. Путь файла должен начинаться
-- с auth.uid() — это предотвращает upload в чужую папку.
DROP POLICY IF EXISTS chat_images_upload_own ON storage.objects;
CREATE POLICY chat_images_upload_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (картинки публичны через URL).
DROP POLICY IF EXISTS chat_images_public_read ON storage.objects;
CREATE POLICY chat_images_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-images');

-- Удаление — только владелец.
DROP POLICY IF EXISTS chat_images_delete_own ON storage.objects;
CREATE POLICY chat_images_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
