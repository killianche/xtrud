-- 0155 — восстановление правил доступа к хранилищу.
--
-- ЧТО СЛУЧИЛОСЬ (FACT, 2026-09-05). Владелец не смог опубликовать задание с
-- фотографией. Лог storage на сервере:
--
--   POST /object/order-photos/<uid>/<file>.jpg → 400
--   "new row violates row-level security policy"
--   role: authenticated, owner: <uid>, code 42501
--
-- Запрос к базе:
--   SELECT count(*) FROM pg_policy WHERE polrelid = 'storage.objects'::regclass;
--   → 0
--   SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass;
--   → true
--
-- То есть защита на таблице включена, а правил, которые кому-либо что-либо
-- разрешают, нет вообще. При такой паре запрещено всё. Сломана была не
-- публикация задания — сломана ЛЮБАЯ загрузка файла: фото задания, аватар,
-- работы в портфолио, документы на проверку.
--
-- ПОЧЕМУ. Правила живут в миграциях 0013, 0014, 0100 и 0070. При переезде на
-- свой сервер перенесли данные и таблицы, а политики схемы storage — нет:
-- корзины на месте, правила нет. Раньше это не замечали, потому что в тестовой
-- базе никто не грузил файлы.
--
-- ЧТО ДЕЛАЕТ ЭТА МИГРАЦИЯ. Восстанавливает ровно то, что описано в тех
-- миграциях, — ничего нового не придумывает:
--   * avatars   — владелец пишет и читает только свою папку {uid}/...
--   * portfolio — то же плюс проверка, что человек исполнитель
--   * order-photos — читают все (фото задания видно в ленте), пишет и удаляет
--                    только владелец своей папки
--   * master-verifications — приватная корзина, только владелец
--   * chat-images — правил нет намеренно: чат удалён миграцией 0110
--
-- Плюс возвращает публичность корзины order-photos: миграция 0100 создаёт её
-- как публичную (приложение строит ссылку через getPublicUrl), а в базе стоит
-- public = false — при таком флаге фото не открылось бы даже после успешной
-- загрузки.

BEGIN;

-- ============================================================================
-- avatars
-- ============================================================================

DROP POLICY IF EXISTS "avatars_owner_list" ON storage.objects;
CREATE POLICY "avatars_owner_list" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

-- ============================================================================
-- portfolio
-- ============================================================================

DROP POLICY IF EXISTS "portfolio_owner_list" ON storage.objects;
CREATE POLICY "portfolio_owner_list" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "portfolio_master_insert" ON storage.objects;
CREATE POLICY "portfolio_master_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid()) AND is_master = true
    )
  );

DROP POLICY IF EXISTS "portfolio_master_update" ON storage.objects;
CREATE POLICY "portfolio_master_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "portfolio_master_delete" ON storage.objects;
CREATE POLICY "portfolio_master_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (SELECT auth.uid()::text) = (storage.foldername(name))[1]
  );

-- ============================================================================
-- order-photos
-- ============================================================================

UPDATE storage.buckets SET public = true WHERE id = 'order-photos';

DROP POLICY IF EXISTS "order_photos_public_read" ON storage.objects;
CREATE POLICY "order_photos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'order-photos');

DROP POLICY IF EXISTS "order_photos_upload_own" ON storage.objects;
CREATE POLICY "order_photos_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "order_photos_delete_own" ON storage.objects;
CREATE POLICY "order_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'order-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- ============================================================================
-- master-verifications (приватная: документы, посторонним не видно)
-- ============================================================================

DROP POLICY IF EXISTS master_verifications_upload_own ON storage.objects;
CREATE POLICY master_verifications_upload_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS master_verifications_select_own ON storage.objects;
CREATE POLICY master_verifications_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS master_verifications_delete_own ON storage.objects;
CREATE POLICY master_verifications_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Проверка: молча уехать эта миграция не должна.
-- ============================================================================

DO $$
DECLARE
  v_policies int;
  v_order_photos_public boolean;
BEGIN
  SELECT count(*) INTO v_policies
  FROM pg_policy WHERE polrelid = 'storage.objects'::regclass;
  IF v_policies < 13 THEN
    RAISE EXCEPTION 'storage_policies_restore_incomplete: получилось % политик', v_policies;
  END IF;

  SELECT public INTO v_order_photos_public FROM storage.buckets WHERE id = 'order-photos';
  IF v_order_photos_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'order_photos_bucket_must_be_public';
  END IF;
END $$;

COMMIT;
