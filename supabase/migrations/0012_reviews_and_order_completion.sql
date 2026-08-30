-- Migration 0012 — reviews + order completion flow.
--
-- Sprint 7.3 минимум:
-- - 1 отзыв client→master по завершённому заказу
-- - master→client откладываем (sprint 8+, dual-rating)
-- - Авто-обновление master_profiles.rating_overall_avg/count через trigger
-- - Расширяем orders RLS: picked_master может сменить status='in_progress'→'completed'

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE public.review_direction AS ENUM ('client_to_master', 'master_to_client');
CREATE TYPE public.review_status AS ENUM ('visible', 'hidden', 'pending');

-- ============================================================================
-- TABLE: reviews
-- ============================================================================

CREATE TABLE public.reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  direction   public.review_direction NOT NULL,
  l2_id       text NOT NULL REFERENCES public.categories_l2(id) ON DELETE RESTRICT,
  rating      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        text CHECK (text IS NULL OR length(text) BETWEEN 1 AND 2000),
  status      public.review_status NOT NULL DEFAULT 'visible',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, author_id),
  CONSTRAINT reviews_author_target_distinct CHECK (author_id != target_id)
);

COMMENT ON TABLE public.reviews IS 'Отзывы по завершённым заказам. Sprint 7: только client_to_master. Sprint 8 — master_to_client (dual-rating).';

CREATE INDEX reviews_target_visible_idx
  ON public.reviews (target_id, direction, created_at DESC)
  WHERE status = 'visible';
CREATE INDEX reviews_l2_id_idx ON public.reviews (l2_id);
CREATE INDEX reviews_author_id_idx ON public.reviews (author_id);

CREATE TRIGGER reviews_set_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- SELECT — все могут видеть только visible отзывы
CREATE POLICY reviews_read_visible ON public.reviews
  FOR SELECT USING (
    status = 'visible'
    OR (SELECT auth.uid()) = author_id
    OR (SELECT auth.uid()) = target_id
  );

-- INSERT — только участник завершённого заказа
CREATE POLICY reviews_insert_participant ON public.reviews
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND author_id != target_id
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id
        AND status = 'completed'
        AND (
          (client_id = author_id AND picked_master_id = target_id)
          OR
          (picked_master_id = author_id AND client_id = target_id)
        )
    )
  );

-- UPDATE — автор может править свой отзыв
CREATE POLICY reviews_update_own ON public.reviews
  FOR UPDATE USING ((SELECT auth.uid()) = author_id)
  WITH CHECK ((SELECT auth.uid()) = author_id);

-- ============================================================================
-- ORDERS RLS — picked_master может перевести status='in_progress'→'completed'
-- ============================================================================

CREATE POLICY orders_picked_master_can_complete ON public.orders
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = picked_master_id
    AND status = 'in_progress'
  )
  WITH CHECK (
    (SELECT auth.uid()) = picked_master_id
    AND status = 'completed'
  );

-- ============================================================================
-- TRIGGER: автоматически пересчитывать master_profiles.rating_overall_avg/count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_master_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target uuid;
  v_avg numeric(2,1);
  v_count int;
BEGIN
  -- На INSERT/UPDATE/DELETE — берём target_id из NEW (для INSERT/UPDATE) или OLD (для DELETE)
  v_target := COALESCE(NEW.target_id, OLD.target_id);

  -- Пересчитываем только для client_to_master direction
  IF v_target IS NOT NULL THEN
    SELECT
      ROUND(AVG(rating)::numeric, 1)::numeric(2,1),
      COUNT(*)
    INTO v_avg, v_count
    FROM public.reviews
    WHERE target_id = v_target
      AND direction = 'client_to_master'
      AND status = 'visible';

    -- Обновляем master_profiles если запись существует
    UPDATE public.master_profiles
      SET rating_overall_avg = v_avg,
          rating_overall_count = COALESCE(v_count, 0)
      WHERE user_id = v_target;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_master_rating() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalc_master_rating() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalc_master_rating() FROM authenticated;

CREATE TRIGGER reviews_recalc_master_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recalc_master_rating();
