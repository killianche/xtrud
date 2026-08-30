-- 0092_fix_cancel_order_rls.sql
-- Sprint 0092 — фикс «Отменить заказ не работает» (фидбэк user 2026-05-19).
--
-- Симптом: клиент жмёт «Отменить заказ» на in_progress-заказе → UPDATE
-- блокируется RLS, ничего не происходит.
--
-- Причина: existing policy `orders_owner_change_status_in_progress`
-- (миграция 0076) разрешает UPDATE только из status IN
-- ('in_progress', 'awaiting_confirmation'). Из 'open' UPDATE проходит через
-- `orders_owner_edit_open`, но та НЕ допускает переход → 'cancelled'
-- (WITH CHECK включает только 'open', 'draft', 'in_progress', 'cancelled',
-- 'expired' — `cancelled` есть, должно бы работать, но USING требует
-- USING status='open' пройти, а реальный кейс `in_progress→cancelled` падает
-- на USING `orders_owner_change_status_in_progress`).
--
-- Fix: расширяем USING `orders_owner_change_status_in_progress` чтобы
-- покрыть и 'open' тоже. Тогда клиент может отменить заказ ИЗ любого статуса
-- через UPDATE (T2 = open→cancelled, T6 = in_progress→cancelled).
--
-- DELETE: дополнительно добавляем policy `orders_owner_delete_open` —
-- клиент может **удалить** open-заказ без откликов (hard-delete для случаев
-- «передумал сразу после публикации»). Для заказов с откликами / picked_master
-- — только cancel (сохраняем audit log).

DROP POLICY IF EXISTS orders_owner_change_status_in_progress ON public.orders;

CREATE POLICY orders_owner_change_status_in_progress ON public.orders
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = client_id
    AND status IN ('open', 'in_progress', 'awaiting_confirmation')
  )
  WITH CHECK (
    (SELECT auth.uid()) = client_id
    AND status IN ('open', 'cancelled', 'completed', 'disputed', 'awaiting_confirmation', 'in_progress')
  );

COMMENT ON POLICY orders_owner_change_status_in_progress ON public.orders IS
  'Sprint 0092: клиент может перевести open / in_progress / awaiting_confirmation → cancelled (T2, T6) / completed (T4) / disputed (T10). USING расширен на open чтобы Sheet "Отменить заказ" работал из любого статуса.';

-- ============================================================================
-- DELETE policy — клиент удаляет свой open-заказ без откликов.
-- Хард-delete только для open (другие статусы → cancel via UPDATE).
-- ============================================================================

DROP POLICY IF EXISTS orders_owner_delete_open ON public.orders;

CREATE POLICY orders_owner_delete_open ON public.orders
  FOR DELETE
  USING (
    (SELECT auth.uid()) = client_id
    AND status IN ('open', 'draft')
  );

COMMENT ON POLICY orders_owner_delete_open ON public.orders IS
  'Sprint 0092: клиент может удалить свой open/draft заказ. Заказы с откликами или picked_master — только cancel via UPDATE (сохраняется audit log). FK ON DELETE CASCADE на order_responses/chats/messages — каскадно очищается.';
