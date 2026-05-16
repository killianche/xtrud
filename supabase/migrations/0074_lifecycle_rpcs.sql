-- Migration 0073 — 5 RPC для lifecycle.
--
-- См. docs/lifecycle.md §4 (матрица переходов) и §10 (RPC list).
--
-- Все SECURITY INVOKER — действуют от имени вызывающего пользователя, проверяют
-- auth.uid() внутри. Триггер 0072 пишет запись в order_status_log с
-- triggered_kind='user' (через INSERT в этих RPC явно прописываем
-- transition_code в metadata через UPDATE log row после смены статуса).

-- ============================================================================
-- RPC: withdraw_response (T15)
--   Мастер отзывает свой отклик. Только из sent/viewed (до accept).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.withdraw_response(p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_master_id uuid;
  v_current_status public.response_status;
  v_order_id uuid;
  v_client_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT master_id, status, order_id INTO v_master_id, v_current_status, v_order_id
  FROM public.order_responses
  WHERE id = p_response_id;

  IF v_master_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_master_id != v_user_id THEN
    RAISE EXCEPTION 'not_response_owner' USING ERRCODE = '42501';
  END IF;

  IF v_current_status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'cannot_withdraw_after_decision' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_responses
    SET status = 'withdrawn', updated_at = now()
    WHERE id = p_response_id;

  -- Push клиенту: «мастер отозвал отклик»
  SELECT client_id INTO v_client_id FROM public.orders WHERE id = v_order_id;
  IF v_client_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_client_id,
      'Мастер отозвал отклик',
      'Один из мастеров передумал. На вашу заявку ещё откликнутся.',
      jsonb_build_object('type', 'response_withdrawn', 'order_id', v_order_id, 'response_id', p_response_id)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.withdraw_response IS
  'Sprint 0073 T15: мастер отзывает свой отклик. Только из sent/viewed (до accept). Уведомляет клиента.';

REVOKE EXECUTE ON FUNCTION public.withdraw_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_response(uuid) TO authenticated;

-- ============================================================================
-- RPC: mark_order_done (T8)
--   Picked master помечает «работа выполнена». in_progress → awaiting_confirmation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_order_done(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_picked_master uuid;
  v_status public.order_status;
  v_client_id uuid;
  v_title text;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT picked_master_id, status, client_id, title
    INTO v_picked_master, v_status, v_client_id, v_title
  FROM public.orders WHERE id = p_order_id;

  IF v_picked_master IS NULL THEN
    RAISE EXCEPTION 'order_not_found_or_no_picked_master' USING ERRCODE = 'P0002';
  END IF;

  IF v_picked_master != v_user_id THEN
    RAISE EXCEPTION 'not_picked_master' USING ERRCODE = '42501';
  END IF;

  IF v_status != 'in_progress' THEN
    RAISE EXCEPTION 'order_not_in_progress' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orders
    SET status = 'awaiting_confirmation',
        master_marked_done_at = v_now,
        awaiting_confirmation_until = v_now + interval '72 hours',
        last_activity_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

  -- Push клиенту
  PERFORM public.notify_user(
    v_client_id,
    'Мастер сообщил, что работа выполнена',
    LEFT(COALESCE(v_title, ''), 120) || E'\nПодтвердите завершение или оспорьте — иначе через 72 часа заказ закроется автоматически.',
    jsonb_build_object('type', 'order_awaiting_confirmation', 'order_id', p_order_id)
  );

  -- Audit log: transition_code
  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (p_order_id, 'in_progress', 'awaiting_confirmation', 'T8', v_user_id, 'user', NULL);
END;
$$;

COMMENT ON FUNCTION public.mark_order_done IS
  'Sprint 0073 T8: picked_master помечает работу выполненной. in_progress → awaiting_confirmation, awaiting_confirmation_until = now()+72h. Cron T11 закроет автоматом если клиент не отреагирует.';

REVOKE EXECUTE ON FUNCTION public.mark_order_done(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_done(uuid) TO authenticated;

-- ============================================================================
-- RPC: confirm_completion (T4 + T5)
--   Клиент подтверждает завершение. in_progress → completed (T4)
--                              ИЛИ awaiting_confirmation → completed (T5).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_completion(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_id uuid;
  v_status public.order_status;
  v_picked_master uuid;
  v_title text;
  v_completion_kind text;
  v_transition text;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT client_id, status, picked_master_id, title
    INTO v_client_id, v_status, v_picked_master, v_title
  FROM public.orders WHERE id = p_order_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_client_id != v_user_id THEN
    RAISE EXCEPTION 'not_order_owner' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('in_progress', 'awaiting_confirmation') THEN
    RAISE EXCEPTION 'order_not_in_active_state' USING ERRCODE = 'P0001';
  END IF;

  v_completion_kind := CASE
    WHEN v_status = 'in_progress' THEN 'client_direct'
    WHEN v_status = 'awaiting_confirmation' THEN 'client_confirmed'
  END;
  v_transition := CASE
    WHEN v_status = 'in_progress' THEN 'T4'
    WHEN v_status = 'awaiting_confirmation' THEN 'T5'
  END;

  UPDATE public.orders
    SET status = 'completed',
        completed_at = v_now,
        completion_kind = v_completion_kind,
        last_activity_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

  -- Push мастеру
  IF v_picked_master IS NOT NULL THEN
    PERFORM public.notify_user(
      v_picked_master,
      'Клиент подтвердил завершение работы',
      LEFT(COALESCE(v_title, ''), 120) || E'\nОставьте отзыв, чтобы помочь будущим клиентам.',
      jsonb_build_object('type', 'order_completed', 'order_id', p_order_id)
    );
  END IF;

  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (p_order_id, v_status, 'completed', v_transition, v_user_id, 'user', jsonb_build_object('completion_kind', v_completion_kind));
END;
$$;

COMMENT ON FUNCTION public.confirm_completion IS
  'Sprint 0073 T4/T5: клиент закрывает заказ. Из in_progress → completed (T4) или awaiting_confirmation → completed (T5).';

REVOKE EXECUTE ON FUNCTION public.confirm_completion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_completion(uuid) TO authenticated;

-- ============================================================================
-- RPC: open_dispute (T10 + T12)
--   Любая сторона открывает спор из in_progress / awaiting_confirmation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_dispute(p_order_id uuid, p_reason text)
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
  v_from_status public.order_status;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'dispute_reason_too_short' USING ERRCODE = '22023';
  END IF;

  IF length(p_reason) > 1000 THEN
    RAISE EXCEPTION 'dispute_reason_too_long' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'cannot_dispute_in_current_state' USING ERRCODE = 'P0001';
  END IF;

  v_from_status := v_status;

  UPDATE public.orders
    SET status = 'disputed',
        dispute_opened_by = v_user_id,
        dispute_reason = trim(p_reason),
        disputed_at = v_now,
        last_activity_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

  -- Push обеим сторонам (кроме инициатора)
  IF v_client_id != v_user_id THEN
    PERFORM public.notify_user(
      v_client_id,
      'Открыт спор по заказу',
      LEFT(COALESCE(v_title, ''), 120) || E'\nСаппорт рассмотрит обращение в течение 5 рабочих дней.',
      jsonb_build_object('type', 'order_disputed', 'order_id', p_order_id, 'opened_by', v_user_id)
    );
  END IF;
  IF v_picked_master IS NOT NULL AND v_picked_master != v_user_id THEN
    PERFORM public.notify_user(
      v_picked_master,
      'Открыт спор по заказу',
      LEFT(COALESCE(v_title, ''), 120) || E'\nСаппорт рассмотрит обращение в течение 5 рабочих дней.',
      jsonb_build_object('type', 'order_disputed', 'order_id', p_order_id, 'opened_by', v_user_id)
    );
  END IF;

  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (
    p_order_id,
    v_from_status,
    'disputed',
    CASE WHEN v_from_status = 'in_progress' THEN 'T12' ELSE 'T10' END,
    v_user_id,
    'user',
    jsonb_build_object('dispute_reason', trim(p_reason))
  );
END;
$$;

COMMENT ON FUNCTION public.open_dispute IS
  'Sprint 0073 T10/T12: открыть спор. Доступно клиенту или picked_master из in_progress / awaiting_confirmation. Reason 10-1000 chars.';

REVOKE EXECUTE ON FUNCTION public.open_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid, text) TO authenticated;

-- ============================================================================
-- RPC: reopen_order (T9)
--   Клиент возвращает cancelled/expired в open. Окно 7 дней с момента updated_at.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reopen_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_id uuid;
  v_status public.order_status;
  v_updated_at timestamptz;
  v_now timestamptz := now();
  v_withdrawn_response record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT client_id, status, updated_at
    INTO v_client_id, v_status, v_updated_at
  FROM public.orders WHERE id = p_order_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_client_id != v_user_id THEN
    RAISE EXCEPTION 'not_order_owner' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'order_not_reopenable' USING ERRCODE = 'P0001';
  END IF;

  IF v_updated_at < v_now - interval '7 days' THEN
    RAISE EXCEPTION 'reopen_window_expired' USING ERRCODE = 'P0001';
  END IF;

  -- Возвращаем в open, очищаем cancel-fields, обновляем expires_at.
  -- picked_master_id чистим только если был — это был T2 (open→cancelled с picked NULL)
  -- или T6 (in_progress→cancelled с picked NOT NULL). В обоих случаях reopen означает
  -- старт сделки заново — отклики нужны новые.
  UPDATE public.orders
    SET status = 'open',
        cancelled_by = NULL,
        cancel_reason = NULL,
        picked_master_id = NULL,
        picked_at = NULL,
        last_activity_at = v_now,
        expires_at = v_now + interval '14 days',
        updated_at = v_now
    WHERE id = p_order_id;

  -- Push'аем мастерам, чьи отклики были withdrawn (T2/T7 side-effect).
  FOR v_withdrawn_response IN
    SELECT master_id FROM public.order_responses
    WHERE order_id = p_order_id
      AND status = 'withdrawn'
    LIMIT 50  -- safety cap
  LOOP
    PERFORM public.notify_user(
      v_withdrawn_response.master_id,
      'Клиент возобновил заказ',
      'Заявка снова открыта. Можно откликнуться заново.',
      jsonb_build_object('type', 'order_reopened', 'order_id', p_order_id)
    );
  END LOOP;

  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (p_order_id, v_status, 'open', 'T9', v_user_id, 'user', jsonb_build_object('reopen_window_left_days', 7));
END;
$$;

COMMENT ON FUNCTION public.reopen_order IS
  'Sprint 0073 T9: клиент возобновляет cancelled/expired заказ в 7-дневном окне. Сбрасывает picked_master_id, expires_at = now()+14d. Push мастерам с withdrawn-откликами.';

REVOKE EXECUTE ON FUNCTION public.reopen_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_order(uuid) TO authenticated;
