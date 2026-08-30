-- 0091_review_window_14d.sql
-- Sprint 0091 — окно отзыва 14 дней (AUDIT_LAUNCH_FUNCTIONAL_2026-05-19 #10).
--
-- До этого: после order.status='completed' отзыв можно оставить когда угодно
-- (через год, через 3 года). Это нарушает спеку lifecycle.md §5 + позволяет
-- мстительные отзывы спустя долгое время после ссоры.
--
-- Решение: RLS INSERT-policy на public.reviews расширяем проверкой
-- `orders.completed_at + interval '14 days' > now()`. Cron не нужен — RLS
-- сама фильтрует. UI-сторона (ClientReviewSection/MasterReviewSection)
-- параллельно прячет форму, чтобы пользователь не пытался отправить.

DROP POLICY IF EXISTS reviews_insert_participant ON public.reviews;

CREATE POLICY reviews_insert_participant ON public.reviews
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND author_id != target_id
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id
        AND status = 'completed'
        AND (completed_at IS NULL OR completed_at + interval '14 days' > now())
        AND (
          (client_id = author_id AND picked_master_id = target_id)
          OR
          (picked_master_id = author_id AND client_id = target_id)
        )
    )
  );

COMMENT ON POLICY reviews_insert_participant ON public.reviews IS
  'Sprint 0091: отзыв можно оставить только в 14-дневном окне с момента completed_at. После этого окна — INSERT блокируется на уровне RLS.';
