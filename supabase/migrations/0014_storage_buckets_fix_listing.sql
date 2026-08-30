-- Migration 0014 — убираем broad SELECT policy с public buckets.
--
-- Advisor flag (lint 0025 `public_bucket_allows_listing`): policy с
-- `USING (bucket_id = 'avatars')` без owner-фильтра разрешает анонимам
-- ВЫПОЛНЯТЬ LIST по всему bucket. Это раскрывает все user_id-папки.
--
-- Public buckets и так читают объекты по прямому URL
-- `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}` без RLS
-- (служба storage возвращает файл, минуя `storage.objects` SELECT).
-- Поэтому broad SELECT policy не нужна для рендера <Image src=…/>.
--
-- Listing (`supabase.storage.from(bucket).list(prefix)`) останется доступным
-- только для своей папки, через явный owner-policy ниже.

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_public_read" ON storage.objects;

-- Узкая SELECT policy — каждый authenticated юзер может листать только свою папку.
CREATE POLICY "avatars_owner_list" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

CREATE POLICY "portfolio_owner_list" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );
