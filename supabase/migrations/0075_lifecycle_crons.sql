-- Migration 0074 — cron jobs для lifecycle.
--
-- Добавляем 2 ночных job'а:
--   * auto_confirm_completions (04:00 UTC) — T11: awaiting_confirmation → completed
--     если awaiting_confirmation_until < now() (прошло 72h без реакции клиента).
--   * cancel_stale_in_progress (05:00 UTC) — T13: in_progress → cancelled
--     если last_activity_at < now() - 30d. reason='stale_no_activity'.
--
-- Существующий nightly_expire_orders (03:00 UTC) из миграции 0024 — не трогаем.
--
-- См. docs/lifecycle.md §5.1.

-- ============================================================================
-- 1. auto_confirm_completions (T11)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_confirm_completions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected int;
  v_order record;
  v_now timestamptz := now();
BEGIN
  v_affected := 0;

  FOR v_order IN
    SELECT id, picked_master_id, client_id, title
    FROM public.orders
    WHERE status = 'awaiting_confirmation'
      AND awaiting_confirmation_until IS NOT NULL
      AND awaiting_confirmation_until < v_now
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders
      SET status = 'completed',
          completed_at = v_now,
          completion_kind = 'auto_confirmed',
          last_activity_at = v_now,
          updated_at = v_now
      WHERE id = v_order.id;

    -- Push клиенту
    PERFORM public.notify_user(
      v_order.client_id,
      'Заказ автоматически закрыт',
      LEFT(COALESCE(v_order.title, ''), 120) || E'\nПрошло 72 часа без подтверждения. Если работа не была выполнена — оставьте отзыв или обратитесь в саппорт.',
      jsonb_build_object('type', 'order_auto_completed', 'order_id', v_order.id)
    );

    -- Push мастеру
    IF v_order.picked_master_id IS NOT NULL THEN
      PERFORM public.notify_user(
        v_order.picked_master_id,
        'Заказ автоматически закрыт',
        LEFT(COALESCE(v_order.title, ''), 120) || E'\nКлиент не отреагировал в течение 72 часов — заказ перешёл в статус «выполнен».',
        jsonb_build_object('type', 'order_auto_completed', 'order_id', v_order.id)
      );
    END IF;

    -- Явная запись в audit log с transition_code
    INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
    VALUES (v_order.id, 'awaiting_confirmation', 'completed', 'T11', NULL, 'cron', jsonb_build_object('completion_kind', 'auto_confirmed'));

    v_affected := v_affected + 1;
  END LOOP;

  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION public.auto_confirm_completions IS
  'Sprint 0074 T11: cron. awaiting_confirmation с истёкшим until → completed (auto_confirmed). Push обеим сторонам.';

REVOKE EXECUTE ON FUNCTION public.auto_confirm_completions() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. cancel_stale_in_progress (T13)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_stale_in_progress()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected int;
  v_order record;
  v_now timestamptz := now();
  v_threshold timestamptz := now() - interval '30 days';
BEGIN
  v_affected := 0;

  FOR v_order IN
    SELECT id, picked_master_id, client_id, title
    FROM public.orders
    WHERE status = 'in_progress'
      AND last_activity_at IS NOT NULL
      AND last_activity_at < v_threshold
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders
      SET status = 'cancelled',
          cancelled_by = NULL,
          cancel_reason = 'stale_no_activity_30d',
          last_activity_at = v_now,
          updated_at = v_now
      WHERE id = v_order.id;

    PERFORM public.notify_user(
      v_order.client_id,
      'Заказ закрыт автоматически',
      LEFT(COALESCE(v_order.title, ''), 120) || E'\nЗаказ был неактивен 30 дней. Если работа продолжается — создайте новый заказ или обратитесь в саппорт.',
      jsonb_build_object('type', 'order_stale_cancelled', 'order_id', v_order.id)
    );

    IF v_order.picked_master_id IS NOT NULL THEN
      PERFORM public.notify_user(
        v_order.picked_master_id,
        'Заказ закрыт автоматически',
        LEFT(COALESCE(v_order.title, ''), 120) || E'\nЗаказ был неактивен 30 дней.',
        jsonb_build_object('type', 'order_stale_cancelled', 'order_id', v_order.id)
      );
    END IF;

    INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
    VALUES (v_order.id, 'in_progress', 'cancelled', 'T13', NULL, 'cron', jsonb_build_object('cancel_reason', 'stale_no_activity_30d'));

    v_affected := v_affected + 1;
  END LOOP;

  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION public.cancel_stale_in_progress IS
  'Sprint 0074 T13: cron. in_progress с last_activity_at > 30d → cancelled (reason=stale_no_activity_30d). Push обеим сторонам.';

REVOKE EXECUTE ON FUNCTION public.cancel_stale_in_progress() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Schedule pg_cron jobs (idempotent).
-- ============================================================================

DO $$
DECLARE
  v_existing_jobid bigint;
BEGIN
  SELECT jobid INTO v_existing_jobid FROM cron.job WHERE jobname = 'nightly_auto_confirm';
  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'nightly_auto_confirm',
  '0 4 * * *',
  $cron$SELECT public.auto_confirm_completions();$cron$
);

DO $$
DECLARE
  v_existing_jobid bigint;
BEGIN
  SELECT jobid INTO v_existing_jobid FROM cron.job WHERE jobname = 'nightly_cancel_stale';
  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'nightly_cancel_stale',
  '0 5 * * *',
  $cron$SELECT public.cancel_stale_in_progress();$cron$
);

-- ============================================================================
-- 4. Update last_activity_at on new messages.
--    Когда участник пишет в чат — обновляем last_activity_at в orders.
--    Это защищает от auto-cancel заказов, где идёт переписка но нет explicit
--    state transition'ов.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_bump_order_activity_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT order_id INTO v_order_id FROM public.chats WHERE id = NEW.chat_id;
  IF v_order_id IS NOT NULL THEN
    UPDATE public.orders
      SET last_activity_at = NEW.created_at
      WHERE id = v_order_id
        AND status IN ('in_progress', 'awaiting_confirmation', 'disputed');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_bump_order_activity_on_message IS
  'Sprint 0074: каждое сообщение в чате обновляет orders.last_activity_at. Защищает от T13 auto-cancel пока идёт активная переписка.';

DROP TRIGGER IF EXISTS messages_bump_order_activity ON public.messages;
CREATE TRIGGER messages_bump_order_activity
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.trg_bump_order_activity_on_message();
