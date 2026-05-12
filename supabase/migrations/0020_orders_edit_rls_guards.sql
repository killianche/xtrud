-- Migration 0020 — узкие RLS-policy на orders для редактирования и смены статуса.
--
-- Sprint 10.2: UI и так блокирует edit при `status != 'open'`, но прямой
-- PostgREST UPDATE-запрос обходил эту защиту — общая policy `orders_update_own`
-- разрешала любые поля в любом статусе. Заменяем её на две узких:
--
-- 1. `orders_owner_edit_open` — редактирование полей пока status в (open/draft).
--    WITH CHECK допускает переход в in_progress (для accept_response RPC) и в
--    cancelled (для cancelOrder из open).
--
-- 2. `orders_owner_change_status_in_progress` — отдельная policy для
--    in_progress → cancelled / completed. USING требует status=in_progress,
--    WITH CHECK ограничивает финальные значения. UPDATE других полей при
--    in_progress теперь невозможен (заказ заморожен после accept).
--
-- Не трогаем:
-- - orders_read_open_or_own (SELECT) — Sprint 5.1
-- - orders_picked_master_can_complete (UPDATE для мастера) — Sprint 7.3
-- - orders_delete_own_drafts (DELETE) — Sprint 5.1

DROP POLICY IF EXISTS orders_update_own ON public.orders;

CREATE POLICY orders_owner_edit_open ON public.orders
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = client_id
    AND status IN ('open', 'draft')
  )
  WITH CHECK (
    (SELECT auth.uid()) = client_id
    AND status IN ('open', 'draft', 'in_progress', 'cancelled')
  );

CREATE POLICY orders_owner_change_status_in_progress ON public.orders
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = client_id
    AND status = 'in_progress'
  )
  WITH CHECK (
    (SELECT auth.uid()) = client_id
    AND status IN ('cancelled', 'completed')
  );

COMMENT ON POLICY orders_owner_edit_open ON public.orders IS
  'Sprint 10.2: владелец редактирует заказ только пока status в (open|draft); переход в in_progress/cancelled разрешён в WITH CHECK для accept_response RPC и cancelOrder.';
COMMENT ON POLICY orders_owner_change_status_in_progress ON public.orders IS
  'Sprint 10.2: владелец может перевести in_progress → cancelled/completed. Другие поля при in_progress UPDATE не пройдут (status не сменится → WITH CHECK fail).';
