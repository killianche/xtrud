-- Migration 0070 — мастер-верификация (паспорт + селфи).
--
-- Контекст: фидбэк user 2026-05-15. Мастер опционально загружает фото
-- селфи + главной страницы паспорта, ждёт ручную проверку админом.
-- При approval — на профиле появляется badge «Паспорт подтверждён».
-- В дальнейшем (после появления админки) verified-мастера получат
-- rating-boost в выдаче; сейчас только статус + badge.
--
-- Что делаем:
--   1. ENUM verification_status: pending / approved / rejected.
--   2. TABLE master_verifications (1:1 с auth.users):
--      - selfie_path / passport_main_path — пути в private bucket
--      - status, submitted_at, reviewed_at, reviewed_by, rejection_reason
--   3. RLS:
--      - SELECT: только owner
--      - INSERT: только owner (status=pending)
--      - UPDATE: только owner и только когда rejected→pending (re-submit)
--      - DELETE: только owner (отозвать заявку)
--      - Service-role (админка) обходит RLS автоматически.
--   4. TRIGGER: sync master_profiles.verification_level >= 1 при approved.
--   5. STORAGE bucket 'master-verifications' — PRIVATE.
--      RLS policies — только owner upload/select/delete в свою папку
--      {user_id}/.... Service-role обходит для админ-просмотра.
--
-- PII: паспорт — sensitive. Bucket private, SELECT-policy у public/anon
-- нет. Никаких publicUrl — клиент должен использовать createSignedUrl
-- (с TTL ≤ 1 час) когда показывает превью загруженного фото самому
-- юзеру. Админка — через service_role.

BEGIN;

-- ============================================================================
-- ENUM
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status') THEN
    CREATE TYPE public.verification_status AS ENUM (
      'pending',
      'approved',
      'rejected'
    );
  END IF;
END$$;

COMMENT ON TYPE public.verification_status IS
  'Статус заявки на верификацию паспорта мастера.';

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.master_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.verification_status NOT NULL DEFAULT 'pending',
  selfie_path text NOT NULL,
  passport_main_path text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text NULL,
  CONSTRAINT master_verifications_paths_nonempty CHECK (
    length(selfie_path) > 0 AND length(passport_main_path) > 0
  )
);

COMMENT ON TABLE public.master_verifications IS
  'Заявки мастеров на верификацию паспорта (PII). 1:1 с auth.users. ' ||
  'Файлы — в приватном storage bucket master-verifications.';

COMMENT ON COLUMN public.master_verifications.status IS
  'pending = на проверке, approved = подтверждён, rejected = отклонён (с причиной).';
COMMENT ON COLUMN public.master_verifications.selfie_path IS
  'Path в bucket master-verifications: {user_id}/selfie-<ts>.jpg';
COMMENT ON COLUMN public.master_verifications.passport_main_path IS
  'Path в bucket master-verifications: {user_id}/passport-<ts>.jpg';
COMMENT ON COLUMN public.master_verifications.reviewed_by IS
  'Админ, проверивший заявку. NULL пока не проверена.';
COMMENT ON COLUMN public.master_verifications.rejection_reason IS
  'Заполняется админом при status=rejected. Показывается мастеру.';

-- Индекс на status — для будущего админ-листа «pending».
CREATE INDEX IF NOT EXISTS master_verifications_status_idx
  ON public.master_verifications (status, submitted_at DESC);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.master_verifications ENABLE ROW LEVEL SECURITY;

-- SELECT — только owner.
DROP POLICY IF EXISTS master_verifications_owner_select ON public.master_verifications;
CREATE POLICY master_verifications_owner_select
  ON public.master_verifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT — только owner на свой row, статус обязан быть pending.
-- reviewed_* поля юзер не может задавать (служебные).
DROP POLICY IF EXISTS master_verifications_owner_insert ON public.master_verifications;
CREATE POLICY master_verifications_owner_insert
  ON public.master_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND rejection_reason IS NULL
  );

-- UPDATE — только owner, и только из состояния rejected → pending (re-submit).
-- Защищает от попыток юзера ставить себе approved или менять служебные поля.
DROP POLICY IF EXISTS master_verifications_owner_resubmit ON public.master_verifications;
CREATE POLICY master_verifications_owner_resubmit
  ON public.master_verifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'rejected')
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND rejection_reason IS NULL
  );

-- DELETE — owner может отозвать свою заявку (например, перед re-submit).
DROP POLICY IF EXISTS master_verifications_owner_delete ON public.master_verifications;
CREATE POLICY master_verifications_owner_delete
  ON public.master_verifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_verifications TO authenticated;

-- ============================================================================
-- TRIGGER: при approve / unapprove синхронизируем master_profiles.verification_level
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_master_verification_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- approved (любой путь: INSERT [маловероятно через RLS] либо UPDATE админом)
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.master_profiles
      SET verification_level = GREATEST(verification_level, 1)
    WHERE user_id = NEW.user_id;
  -- ранее был approved, теперь нет — откатываем level 1 → 0
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'approved'
        AND NEW.status IS DISTINCT FROM 'approved'
  THEN
    UPDATE public.master_profiles
      SET verification_level = 0
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS master_verifications_sync_level
  ON public.master_verifications;
CREATE TRIGGER master_verifications_sync_level
  AFTER INSERT OR UPDATE OF status ON public.master_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_master_verification_level();

-- Также при DELETE row'а (мастер отозвал, или каскад удаления auth.users) —
-- откатываем verification_level до 0 если он был выставлен.
CREATE OR REPLACE FUNCTION public.reset_verification_level_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    UPDATE public.master_profiles
      SET verification_level = 0
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS master_verifications_reset_level_on_delete
  ON public.master_verifications;
CREATE TRIGGER master_verifications_reset_level_on_delete
  AFTER DELETE ON public.master_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_verification_level_on_delete();

-- ============================================================================
-- STORAGE bucket + policies
-- ============================================================================

-- Bucket PRIVATE (public=false). Доступ только через signed URLs или service_role.
INSERT INTO storage.buckets (id, name, public)
VALUES ('master-verifications', 'master-verifications', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- UPLOAD — только owner в свою папку {user_id}/...
DROP POLICY IF EXISTS master_verifications_upload_own ON storage.objects;
CREATE POLICY master_verifications_upload_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT — только owner. Сторонние НЕ могут читать (PII).
-- Админка — через service_role (обходит RLS).
DROP POLICY IF EXISTS master_verifications_select_own ON storage.objects;
CREATE POLICY master_verifications_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE — только owner.
DROP POLICY IF EXISTS master_verifications_delete_own ON storage.objects;
CREATE POLICY master_verifications_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE — только owner (используется upsert при re-submit).
DROP POLICY IF EXISTS master_verifications_update_own ON storage.objects;
CREATE POLICY master_verifications_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'master-verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
