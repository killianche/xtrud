-- Migration 0072 — колонки + constraints для расширенного lifecycle.
--
-- Why. См. docs/lifecycle.md. Применяется ПОСЛЕ 0071 (ENUM additions).
-- 0071 в отдельной миграции, потому что PG запрещает использовать новое
-- ENUM-значение в той же транзакции, где оно добавлено.
--
-- Что делает:
--   - новые колонки orders: picked_at, master_marked_done_at, completed_at,
--     awaiting_confirmation_until, last_activity_at, cancelled_by, cancel_reason,
--     dispute_*, resolved_*, completion_kind, resolution_kind.
--   - backfill для существующих заказов (приближение timestamp'ов).
--   - исправляет баг constraint `orders_picked_only_if_in_progress`:
--     он запрещал T6 (in_progress → cancelled с picked_master_id NOT NULL).
--   - новые constraints для consistency полей.
--   - индексы для cron-jobs.
--   - default expires_at: 30d → 14d.
--
-- Применяется до 0073–0076 (audit log, RPCs, crons, RLS).

-- ============================================================================
-- 1. Новые колонки в orders.
--    Все NULLABLE — заполняются только на соответствующих переходах.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS picked_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS master_marked_done_at      timestamptz,
  ADD COLUMN IF NOT EXISTS awaiting_confirmation_until timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS completion_kind            text
    CHECK (completion_kind IS NULL OR completion_kind IN (
      'client_direct',      -- T4: клиент закрыл напрямую из in_progress
      'client_confirmed',   -- T5: клиент подтвердил из awaiting_confirmation
      'auto_confirmed',     -- T11: cron закрыл после 72h в awaiting_confirmation
      'support_resolved'    -- T14: саппорт закрыл из disputed
    )),
  ADD COLUMN IF NOT EXISTS last_activity_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by               uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason              text
    CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),
  ADD COLUMN IF NOT EXISTS dispute_opened_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_reason             text
    CHECK (dispute_reason IS NULL OR length(dispute_reason) <= 1000),
  ADD COLUMN IF NOT EXISTS disputed_at                timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at                timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by                uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_kind            text
    CHECK (resolution_kind IS NULL OR resolution_kind IN ('client_won', 'master_won', 'split'));

COMMENT ON COLUMN public.orders.picked_at IS 'T3 timestamp: когда RPC accept_response выбрал picked_master_id.';
COMMENT ON COLUMN public.orders.master_marked_done_at IS 'T8 timestamp: когда picked_master нажал mark_order_done.';
COMMENT ON COLUMN public.orders.awaiting_confirmation_until IS 'T8 deadline = master_marked_done_at + 72h. После — cron auto_confirm_completions переводит в completed (T11).';
COMMENT ON COLUMN public.orders.completed_at IS 'T4/T5/T11/T14 timestamp: когда заказ перешёл в completed. Окно отзыва открыто 14 дней с этой даты.';
COMMENT ON COLUMN public.orders.completion_kind IS 'Кто/что закрыл заказ: client_direct (T4), client_confirmed (T5), auto_confirmed (T11), support_resolved (T14).';
COMMENT ON COLUMN public.orders.last_activity_at IS 'Обновляется при mark_done, dispute, любом сообщении в чате (sprint 0074). Cron cancel_stale_in_progress закрывает заказ если > 30d без активности.';
COMMENT ON COLUMN public.orders.cancelled_by IS 'auth.uid() того, кто отменил. NULL для T13 (cron stale).';
COMMENT ON COLUMN public.orders.cancel_reason IS 'Опциональная причина отмены (text, до 500 символов).';
COMMENT ON COLUMN public.orders.dispute_opened_by IS 'auth.uid() стороны, открывшей спор.';
COMMENT ON COLUMN public.orders.disputed_at IS 'T10/T12 timestamp.';
COMMENT ON COLUMN public.orders.resolved_at IS 'T14 timestamp: когда саппорт закрыл спор.';
COMMENT ON COLUMN public.orders.resolution_kind IS 'Решение по dispute: client_won (заказ → cancelled), master_won (→ completed), split (комбинированное).';

-- ============================================================================
-- 2. Backfill: для существующих заказов проставим picked_at = updated_at
--    (для in_progress/completed/disputed) и last_activity_at = updated_at везде.
--    Это приближение — точные timestamp'ы потеряны, но cron'ы и UI получат
--    осмысленные значения вместо NULL.
-- ============================================================================

UPDATE public.orders
SET picked_at = COALESCE(picked_at, updated_at)
WHERE picked_master_id IS NOT NULL AND picked_at IS NULL;

UPDATE public.orders
SET completed_at = COALESCE(completed_at, updated_at),
    completion_kind = COALESCE(completion_kind, 'client_direct')
WHERE status = 'completed' AND completed_at IS NULL;

UPDATE public.orders
SET last_activity_at = COALESCE(last_activity_at, updated_at);

-- ============================================================================
-- 3. Исправляем баг constraint orders_picked_only_if_in_progress.
--    Старый: запрещал picked_master_id NOT NULL для cancelled — ломал T6.
--    Новый: picked NOT NULL ⟹ status ∈ workflow-set (после accept).
-- ============================================================================

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_picked_only_if_in_progress;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_picked_only_after_accept
    CHECK (
      picked_master_id IS NULL
      OR status IN ('in_progress', 'awaiting_confirmation', 'completed', 'disputed', 'cancelled')
    );

COMMENT ON CONSTRAINT orders_picked_only_after_accept ON public.orders IS
  'Sprint 0071: picked_master_id выставляется только из T3 (accept_response). После — остаётся как history через cancelled/completed/disputed. До accept (draft/open/expired) — должен быть NULL.';

-- ============================================================================
-- 4. Constraint: completed_at заполнен ⟺ status ∈ (completed, disputed-resolved-to-completed)
--    Упрощаем: completed_at NOT NULL ⟹ status ∈ (completed, disputed). NULL допустим в любом другом.
-- ============================================================================

ALTER TABLE public.orders
  ADD CONSTRAINT orders_completed_at_consistency
    CHECK (
      completed_at IS NULL OR status IN ('completed', 'disputed')
    );

-- ============================================================================
-- 5. Constraint: awaiting_confirmation_until заполнен ⟺ status='awaiting_confirmation'.
-- ============================================================================

ALTER TABLE public.orders
  ADD CONSTRAINT orders_awaiting_until_consistency
    CHECK (
      awaiting_confirmation_until IS NULL OR status IN ('awaiting_confirmation', 'completed', 'disputed', 'cancelled')
    );

-- ============================================================================
-- 6. Constraint: dispute_opened_by ⟺ disputed_at заполнены вместе.
-- ============================================================================

ALTER TABLE public.orders
  ADD CONSTRAINT orders_dispute_fields_consistency
    CHECK (
      (dispute_opened_by IS NULL AND disputed_at IS NULL)
      OR (dispute_opened_by IS NOT NULL AND disputed_at IS NOT NULL)
    );

-- ============================================================================
-- 7. Индексы для cron-jobs и common queries.
-- ============================================================================

CREATE INDEX IF NOT EXISTS orders_awaiting_until_idx
  ON public.orders (awaiting_confirmation_until)
  WHERE status = 'awaiting_confirmation';

CREATE INDEX IF NOT EXISTS orders_last_activity_idx
  ON public.orders (last_activity_at)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS orders_disputed_at_idx
  ON public.orders (disputed_at)
  WHERE status = 'disputed';

-- ============================================================================
-- 8. Update default expires_at: 30 days было исторически. Меняем на 14 days
--    согласно benchmark Profi.ru/YouDo + согласованию sprint 0071.
--    Существующие заказы НЕ трогаем — у них expires_at уже выставлен.
-- ============================================================================

ALTER TABLE public.orders
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days');

COMMENT ON COLUMN public.orders.expires_at IS
  'Sprint 0071: default 14 дней (было 30). Cron nightly_expire_orders переводит open → expired по этому полю.';
