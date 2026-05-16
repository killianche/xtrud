-- Migration 0072 — audit log переходов состояний заказа.
--
-- Why. Sprint 0071 расширяет state-machine до 8 статусов + 15 переходов. Для
-- саппорта (разрешение споров), аналитики (avg time-to-complete) и debugging
-- («почему этот заказ висит в awaiting?») нужен полный лог всех transitions.
--
-- Trigger пишет строку при AFTER UPDATE OF status. Прямой UPDATE pgs PostgREST
-- → row с triggered_kind='user'; cron functions → triggered_kind='cron';
-- RPC SECURITY DEFINER → передают через metadata.
--
-- См. docs/lifecycle.md §7.

CREATE TABLE public.order_status_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status     public.order_status,
  to_status       public.order_status NOT NULL,
  transition_code text,
  triggered_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  triggered_kind  text NOT NULL CHECK (triggered_kind IN ('user', 'cron', 'support', 'trigger', 'system')),
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_status_log IS
  'Sprint 0072: audit log всех transitions order.status. Пишется триггером + явно из RPC (для прокидывания metadata). См. docs/lifecycle.md §7.';

COMMENT ON COLUMN public.order_status_log.transition_code IS
  'Код перехода из docs/lifecycle.md §4 (T1, T3, T8, T10 ...). NULL допустим для legacy записей.';
COMMENT ON COLUMN public.order_status_log.triggered_kind IS
  'user — прямой UPDATE через PostgREST; cron — pg_cron job; support — service_role admin; trigger — DB trigger side-effect; system — initial backfill.';
COMMENT ON COLUMN public.order_status_log.metadata IS
  'JSONB с произвольной информацией о переходе: cancel_reason, dispute_reason, resolution_kind и т.п.';

CREATE INDEX order_status_log_order_id_idx
  ON public.order_status_log (order_id, created_at DESC);

CREATE INDEX order_status_log_triggered_by_idx
  ON public.order_status_log (triggered_by, created_at DESC)
  WHERE triggered_by IS NOT NULL;

CREATE INDEX order_status_log_to_status_idx
  ON public.order_status_log (to_status, created_at DESC);

-- ============================================================================
-- RLS: участники заказа (client / picked_master) видят свою историю.
-- Саппорт через service_role видит всё (RLS bypass).
-- Anon — никогда.
-- ============================================================================

ALTER TABLE public.order_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_status_log_read_participants ON public.order_status_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_log.order_id
        AND ((SELECT auth.uid()) IN (o.client_id, o.picked_master_id))
    )
  );

-- INSERT — только через trigger (BEFORE) или RPC (SECURITY DEFINER).
-- Прямой INSERT клиентом / мастером запрещён.

-- ============================================================================
-- Trigger: AFTER UPDATE OF status пишет запись.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_triggered_by uuid;
  v_kind text;
BEGIN
  -- Только реальные смены status, не любые UPDATE.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- auth.uid() есть только если UPDATE инициирован пользователем через PostgREST.
  -- Для cron / SECURITY DEFINER функций — NULL.
  v_triggered_by := auth.uid();
  v_kind := CASE
    WHEN v_triggered_by IS NULL THEN 'cron'
    ELSE 'user'
  END;

  INSERT INTO public.order_status_log (
    order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata
  ) VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    NULL,  -- transition_code заполняется явно из RPC при необходимости
    v_triggered_by,
    v_kind,
    jsonb_strip_nulls(jsonb_build_object(
      'cancelled_by', NEW.cancelled_by,
      'cancel_reason', NEW.cancel_reason,
      'dispute_opened_by', NEW.dispute_opened_by,
      'dispute_reason', NEW.dispute_reason,
      'completion_kind', NEW.completion_kind,
      'resolution_kind', NEW.resolution_kind,
      'picked_master_id', NEW.picked_master_id
    ))
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_log_order_status_change IS
  'Sprint 0072: AFTER UPDATE OF status — пишет строку в order_status_log. transition_code остаётся NULL (заполняется из RPC явно через INSERT).';

DROP TRIGGER IF EXISTS orders_log_status_change ON public.orders;
CREATE TRIGGER orders_log_status_change
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_log_order_status_change();

-- ============================================================================
-- Backfill: для всех существующих заказов пишем по 1 строке (текущий status).
-- Это даёт стартовую точку для аналитики; реальные исторические переходы
-- (open → in_progress и т.д.) недоступны.
-- ============================================================================

INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata, created_at)
SELECT
  id,
  NULL,
  status,
  'backfill',
  NULL,
  'system',
  jsonb_build_object('backfilled_at', now(), 'note', 'initial state before audit log existed'),
  COALESCE(updated_at, created_at)
FROM public.orders;
