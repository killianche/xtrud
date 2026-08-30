-- Migration 0075 — RLS updates под расширенный lifecycle.
--
-- Меняем 3 вещи:
--   1. DROP orders_picked_master_can_complete — мастер больше не пишет статус
--      напрямую. Теперь только через RPC mark_order_done (T8).
--   2. Расширяем orders_owner_change_status_in_progress: WITH CHECK теперь
--      включает 'awaiting_confirmation' и 'completed' (для confirm_completion RPC)
--      + 'disputed' (для open_dispute RPC).
--      USING расширяется на awaiting_confirmation тоже.
--   3. Добавляем policy orders_picked_master_change_status — picked master может
--      обновить status (через RPC mark_order_done, open_dispute) — RPC SECURITY
--      INVOKER, поэтому RLS должен пропустить.
--
-- См. docs/lifecycle.md §10.

-- ============================================================================
-- 1. DROP старую policy для мастера-completion. Заменена RPC mark_order_done.
-- ============================================================================

DROP POLICY IF EXISTS orders_picked_master_can_complete ON public.orders;

-- ============================================================================
-- 2. Расширяем policy для клиента на in_progress + awaiting_confirmation.
--    Drop & recreate — изменение USING без DROP не разрешено для существующих.
-- ============================================================================

DROP POLICY IF EXISTS orders_owner_change_status_in_progress ON public.orders;

CREATE POLICY orders_owner_change_status_in_progress ON public.orders
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = client_id
    AND status IN ('in_progress', 'awaiting_confirmation')
  )
  WITH CHECK (
    (SELECT auth.uid()) = client_id
    AND status IN ('cancelled', 'completed', 'disputed', 'awaiting_confirmation', 'in_progress')
  );

COMMENT ON POLICY orders_owner_change_status_in_progress ON public.orders IS
  'Sprint 0075: клиент может перевести in_progress / awaiting_confirmation → cancelled/completed/disputed. Допускает SET-fields (cancel_reason и т.п.) с тем же status. RPC SECURITY INVOKER проходит через эту policy.';

-- ============================================================================
-- 3. Policy для picked master — обновление status через RPC.
--    RPC mark_order_done и open_dispute — SECURITY INVOKER, действуют от имени
--    picked_master. Им нужна policy с USING/WITH CHECK для master_id.
-- ============================================================================

CREATE POLICY orders_picked_master_lifecycle ON public.orders
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = picked_master_id
    AND status IN ('in_progress', 'awaiting_confirmation')
  )
  WITH CHECK (
    (SELECT auth.uid()) = picked_master_id
    AND status IN ('in_progress', 'awaiting_confirmation', 'disputed')
  );

COMMENT ON POLICY orders_picked_master_lifecycle ON public.orders IS
  'Sprint 0075: picked_master может обновить status через RPC: in_progress → awaiting_confirmation (T8 mark_order_done), in_progress / awaiting_confirmation → disputed (T12 open_dispute). Прямой переход в completed запрещён — клиент подтверждает или cron T11.';

-- ============================================================================
-- 4. Расширяем orders_owner_edit_open WITH CHECK на reopen-сценарий.
--    После reopen_order (T9) status снова 'open' с тем же client_id — это
--    выполняется внутри RPC SECURITY INVOKER, нужно чтобы прошло.
--    Текущая policy уже разрешает client_id=auth.uid AND status IN (open, draft).
--    Расширяем USING на cancelled/expired (для reopen RPC) с тем же CHECK.
-- ============================================================================

DROP POLICY IF EXISTS orders_owner_edit_open ON public.orders;

CREATE POLICY orders_owner_edit_open ON public.orders
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = client_id
    AND status IN ('open', 'draft', 'cancelled', 'expired')
  )
  WITH CHECK (
    (SELECT auth.uid()) = client_id
    AND status IN ('open', 'draft', 'in_progress', 'cancelled', 'expired')
  );

COMMENT ON POLICY orders_owner_edit_open ON public.orders IS
  'Sprint 0075: владелец редактирует open/draft заказы + RPC reopen_order переводит cancelled/expired → open через эту policy (SECURITY INVOKER). Note: WITH CHECK включает in_progress для accept_response RPC, не для прямого UPDATE.';

-- ============================================================================
-- 5. Read policy — расширить для новых статусов.
--    Существующая orders_read_open_or_own разрешает SELECT для status IN
--    (open, in_progress, completed). Добавляем awaiting_confirmation, disputed
--    для участников.
-- ============================================================================

DROP POLICY IF EXISTS orders_read_open_or_own ON public.orders;

CREATE POLICY orders_read_open_or_own ON public.orders
  FOR SELECT
  USING (
    -- Все могут видеть открытые feed-заказы
    status = 'open'
    -- Участники видят свой заказ в любом статусе
    OR (SELECT auth.uid()) = client_id
    OR (SELECT auth.uid()) = picked_master_id
  );

COMMENT ON POLICY orders_read_open_or_own ON public.orders IS
  'Sprint 0075: feed читает status=open; участники (client/picked_master) видят свой заказ в любом статусе (включая awaiting_confirmation/disputed/cancelled/expired).';

-- ============================================================================
-- 6. order_responses — мастер может UPDATE свой отклик на withdrawn (T15
--    через RPC withdraw_response, SECURITY INVOKER).
--    Текущая policy order_responses_update_own_master разрешает мастеру
--    обновлять свой отклик. Убедимся что есть.
-- ============================================================================

-- Проверяем что policy существует. Если нет — создаём.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_responses'
      AND policyname = 'order_responses_update_own_master'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY order_responses_update_own_master ON public.order_responses
        FOR UPDATE
        USING ((SELECT auth.uid()) = master_id)
        WITH CHECK ((SELECT auth.uid()) = master_id);
    $sql$;
    COMMENT ON POLICY order_responses_update_own_master ON public.order_responses IS
      'Sprint 0075 (fallback): мастер обновляет свой отклик. Используется RPC withdraw_response (sent/viewed → withdrawn).';
  END IF;
END $$;
