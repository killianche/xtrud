-- Migration 0013 — Storage buckets для аватаров и портфолио.
--
-- Sprint 8.1 фото-инфраструктура:
-- - bucket `avatars` (public read, owner-write): {user_id}/avatar.{ext}, ≤2MB
-- - bucket `portfolio` (public read, master-write): {user_id}/{uuid}.{ext}, ≤5MB
-- - RLS на storage.objects — папка пользователя определяется по auth.uid()::text == (storage.foldername(name))[1]
--
-- Размеры рассчитаны для уже отресайзленных клиентом фото
-- (avatar до 512x512 ~80KB jpeg q80, portfolio до 1600x1600 ~400KB jpeg q82).
-- Лимиты с запасом ×5 на случай WebP/PNG/неудачного сжатия.

-- ============================================================================
-- BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    2 * 1024 * 1024,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'portfolio',
    'portfolio',
    true,
    5 * 1024 * 1024,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- RLS POLICIES — avatars bucket
-- ============================================================================

-- SELECT: bucket public, читают все (включая anon)
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- INSERT: только владелец папки {user_id}/...
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

-- UPDATE: только владелец
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

-- DELETE: только владелец
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

-- ============================================================================
-- RLS POLICIES — portfolio bucket
-- ============================================================================

-- SELECT: bucket public
CREATE POLICY "portfolio_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'portfolio');

-- INSERT: только мастер пишет в свою папку
CREATE POLICY "portfolio_master_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid()) AND is_master = true
    )
  );

-- UPDATE: только владелец-мастер
CREATE POLICY "portfolio_master_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

-- DELETE: только владелец-мастер
CREATE POLICY "portfolio_master_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );
