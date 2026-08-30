-- Migration 0015 — portfolio_items для мастеров + length-check на users.avatar_url.
--
-- Sprint 8.2:
-- - portfolio_items — фото работ мастера. До 12 элементов (Profi.ru-стандарт).
-- - Public SELECT — клиенты должны видеть портфолио до отклика.
-- - Owner-only writes — обновляет только сам мастер.
-- - sort_order — ручное упорядочивание (drag-reorder в sprint 9; пока ↑↓).
-- - users.avatar_url существовала с 0001 без length-CHECK — добавляем.

-- ============================================================================
-- USERS.avatar_url length CHECK
-- ============================================================================

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_url_length_chk
  CHECK (avatar_url IS NULL OR length(avatar_url) <= 500);

COMMENT ON COLUMN public.users.avatar_url IS
  'Public URL аватара (с ?v=timestamp cache-bust). NULL = инициалы-fallback на клиенте.';

-- ============================================================================
-- TABLE: portfolio_items
-- ============================================================================

CREATE TABLE public.portfolio_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  url           text NOT NULL CHECK (length(url) <= 500),
  storage_path  text NOT NULL CHECK (length(storage_path) <= 300),
  width         int CHECK (width IS NULL OR (width > 0 AND width <= 8000)),
  height        int CHECK (height IS NULL OR (height > 0 AND height <= 8000)),
  caption       text CHECK (caption IS NULL OR length(caption) <= 200),
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.portfolio_items IS
  'Фото работ мастера. До 12 на мастера (trigger). Read public — нужно показывать клиентам.';
COMMENT ON COLUMN public.portfolio_items.storage_path IS
  'Путь в bucket portfolio для удаления при DELETE row.';
COMMENT ON COLUMN public.portfolio_items.sort_order IS
  'Ручное упорядочивание мастером. Меньше = выше в grid.';

CREATE INDEX portfolio_items_master_sort_idx
  ON public.portfolio_items (master_id, sort_order, created_at);

CREATE TRIGGER portfolio_items_set_updated_at
BEFORE UPDATE ON public.portfolio_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- TRIGGER: лимит 12 фото на мастера
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_portfolio_items_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.portfolio_items
  WHERE master_id = NEW.master_id;

  IF v_count >= 12 THEN
    RAISE EXCEPTION 'max_12_portfolio_items_per_master' USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_portfolio_items_limit IS
  'Trigger function: лимит 12 портфолио-фото на мастера.';

REVOKE EXECUTE ON FUNCTION public.check_portfolio_items_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_portfolio_items_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_portfolio_items_limit() FROM authenticated;

CREATE TRIGGER portfolio_items_max_12_per_master
BEFORE INSERT ON public.portfolio_items
FOR EACH ROW EXECUTE FUNCTION public.check_portfolio_items_limit();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY portfolio_items_read_all ON public.portfolio_items
  FOR SELECT USING (true);

CREATE POLICY portfolio_items_insert_own ON public.portfolio_items
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = master_id
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid()) AND is_master = true
    )
  );

CREATE POLICY portfolio_items_update_own ON public.portfolio_items
  FOR UPDATE USING ((SELECT auth.uid()) = master_id)
  WITH CHECK ((SELECT auth.uid()) = master_id);

CREATE POLICY portfolio_items_delete_own ON public.portfolio_items
  FOR DELETE USING ((SELECT auth.uid()) = master_id);
