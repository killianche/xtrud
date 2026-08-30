-- Migration 0077 — RPC terminate_cooperation.
--
-- Why. User feedback (2026-05-16): «Не надо dispute, у нас редко такое.
-- Лучше кнопка "Прекратить сотрудничество" — работа не дошла до конца,
-- просто закрываем без саппорта».
--
-- Поведение:
--   - Доступно клиенту И picked_master_id (обе стороны симметрично).
--   - Только из in_progress / awaiting_confirmation.
--   - Order → cancelled, cancel_reason = 'cooperation_ended_by_<client|master>',
--     cancelled_by = auth.uid().
--   - Push другой стороне «Сотрудничество прекращено».
--   - Audit log с transition_code='T6t' (T6-terminate, отличается от обычного T6
--     отменой клиентом из open).
--
-- Status `disputed` и RPC open_dispute остаются в БД для будущей админки,
-- но не используются в UI. Backwards-compat.

CREATE OR REPLACE FUNCTION public.terminate_cooperation(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_id uuid;
  v_picked_master uuid;
  v_status public.order_status;
  v_title text;
  v_now timestamptz := now();
  v_initiator_role text;
  v_reason text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NOT NULL AND length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT client_id, picked_master_id, status, title
    INTO v_client_id, v_picked_master, v_status, v_title
  FROM public.orders WHERE id = p_order_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user_id NOT IN (v_client_id, v_picked_master) THEN
    RAISE EXCEPTION 'not_order_participant' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('in_progress', 'awaiting_confirmation') THEN
    RAISE EXCEPTION 'cannot_terminate_in_current_state' USING ERRCODE = 'P0001';
  END IF;

  v_initiator_role := CASE
    WHEN v_user_id = v_client_id THEN 'client'
    ELSE 'master'
  END;

  v_reason := COALESCE(
    NULLIF(trim(COALESCE(p_reason, '')), ''),
    'cooperation_ended_by_' || v_initiator_role
  );

  UPDATE public.orders
    SET status = 'cancelled',
        cancelled_by = v_user_id,
        cancel_reason = v_reason,
        last_activity_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

  -- Push другой стороне
  IF v_initiator_role = 'client' AND v_picked_master IS NOT NULL THEN
    PERFORM public.notify_user(
      v_picked_master,
      'Клиент прекратил сотрудничество',
      LEFT(COALESCE(v_title, ''), 120) || E'\nЗаказ закрыт. Если работа была частично сделана — обсудите оплату в чате.',
      jsonb_build_object('type', 'cooperation_terminated', 'order_id', p_order_id, 'by', 'client')
    );
  ELSIF v_initiator_role = 'master' AND v_client_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_client_id,
      'Мастер прекратил сотрудничество',
      LEFT(COALESCE(v_title, ''), 120) || E'\nЗаказ закрыт. Можно создать новый или возобновить этот в течение 7 дней.',
      jsonb_build_object('type', 'cooperation_terminated', 'order_id', p_order_id, 'by', 'master')
    );
  END IF;

  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (
    p_order_id,
    v_status,
    'cancelled',
    'T6t',
    v_user_id,
    'user',
    jsonb_build_object('cancel_reason', v_reason, 'initiator', v_initiator_role)
  );
END;
$$;

COMMENT ON FUNCTION public.terminate_cooperation IS
  'Sprint 0077: обе стороны (client/picked_master) прекращают сотрудничество. Order in_progress/awaiting_confirmation → cancelled. Заменяет dispute-flow для типичных «работа не дошла до конца» случаев. RPC reopen_order работает (T9 7d окно).';

REVOKE EXECUTE ON FUNCTION public.terminate_cooperation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminate_cooperation(uuid, text) TO authenticated;

-- ============================================================================
-- RLS обновление: picked_master теперь может перевести status='cancelled'
-- через RPC terminate_cooperation. Существующая orders_picked_master_lifecycle
-- разрешала только in_progress/awaiting_confirmation/disputed в WITH CHECK,
-- добавим cancelled.
-- ============================================================================

DROP POLICY IF EXISTS orders_picked_master_lifecycle ON public.orders;
CREATE POLICY orders_picked_master_lifecycle ON public.orders
  FOR UPDATE
  USING ((SELECT auth.uid()) = picked_master_id
         AND status IN ('in_progress', 'awaiting_confirmation'))
  WITH CHECK ((SELECT auth.uid()) = picked_master_id
              AND status IN ('in_progress', 'awaiting_confirmation', 'disputed', 'cancelled'));
COMMENT ON POLICY orders_picked_master_lifecycle ON public.orders IS
  'Sprint 0077: picked_master через RPC может: mark_order_done (T8), open_dispute (T10/T12), terminate_cooperation (T6t cancelled).';
