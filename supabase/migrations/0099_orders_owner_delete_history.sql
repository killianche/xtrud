-- 0099_orders_owner_delete_history.sql
-- Sprint 0099 — клиент может удалить свой заказ из «Истории» (cancelled / expired).
--
-- Контекст. В classified-ads модели (см. docs/SIMPLE_FLOW.md,
-- docs/ORDER_LIFECYCLE_CLIENT_PLAN.md) клиент управляет заказом тремя действиями:
-- «Редактировать» (пока open), «Закрыть» (open → cancelled) и «Удалить».
-- По плану ПМ удаление доступно ТОЛЬКО для заказов из «Истории» —
-- т.е. cancelled или expired. Открытый заказ удалить нельзя: сначала «Закрыть»
-- (защита от случайного стирания активной заявки с откликами — паттерн Avito/Profi).
--
-- Текущее состояние RLS на DELETE (проверено на живой базе):
--   - orders_delete_own_drafts  → status = 'draft'
--   - orders_owner_delete_open  → status IN ('open', 'draft')
-- Ни одна не покрывает cancelled / expired. Поэтому добавляем новую политику.
--
-- Безопасность операции:
--   - Только ADD POLICY (аддитивно, ничего не дропаем и не теряем).
--   - USING ограничен своим заказом (auth.uid() = client_id) и только
--     завершёнными статусами cancelled / expired.
--   - FK ON DELETE CASCADE на order_responses/chats/messages уже настроен
--     (см. 0009_orders_and_responses.sql) — связанные записи каскадно удалятся.
--   - История переходов в order_status_log сохраняется отдельно (на неё FK
--     с ON DELETE SET NULL, строки лога остаются для статистики платформы).

DROP POLICY IF EXISTS orders_owner_delete_history ON public.orders;

CREATE POLICY orders_owner_delete_history ON public.orders
  FOR DELETE
  USING (
    (SELECT auth.uid()) = client_id
    AND status IN ('cancelled', 'expired')
  );

COMMENT ON POLICY orders_owner_delete_history ON public.orders IS
  'Sprint 0099: клиент удаляет свой закрытый (cancelled) или истёкший (expired) заказ из «Истории». Открытый заказ сначала «Закрыть» (orders_owner_delete_open покрывает open/draft отдельно). FK ON DELETE CASCADE каскадно чистит order_responses.';
