-- Migration 0019 — атмосферные фото категорий.
--
-- Sprint 8.7:
-- - `categories_l2.cover_image_url` (length ≤ 500) — public URL фото обложки.
--   NULL → fallback на иконку (текущий surface-2 + lucide-icon рендер).
-- - bucket `category-covers` (public read, admin-only writes через service_role).
--   Никаких user-RLS на INSERT/UPDATE/DELETE — администратор грузит через
--   Supabase Dashboard / CLI с service_role key.

-- ============================================================================
-- COLUMN
-- ============================================================================

ALTER TABLE public.categories_l2
  ADD COLUMN cover_image_url text
  CHECK (cover_image_url IS NULL OR length(cover_image_url) <= 500);

COMMENT ON COLUMN public.categories_l2.cover_image_url IS
  'Public URL обложки категории (1600×900 jpeg, ~250KB). NULL → icon-fallback.';

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'category-covers',
  'category-covers',
  true,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS на storage.objects для этого bucket НЕ создаём:
-- - Чтение объектов идёт через прямой public URL без RLS (см. sprint 8.1, lint 0025).
-- - Запись только service_role (миграции / админ через Dashboard).
