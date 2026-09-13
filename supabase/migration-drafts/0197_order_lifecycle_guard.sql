-- 0197: защита жизненного цикла задания (продолжение 0196).
--
-- Права на orders у роли приложения — по колонкам, и среди них status и
-- picked_master_id (так было со старой схемы). Значит, автор мог бы прямым
-- UPDATE поставить «Завершено» и любого специалиста исполнителем — и
-- оставить ему отзыв, не имея с ним никакой работы. Триггер закрывает это
-- для прямых записей из приложения (current_user = authenticated/anon):
--   - «Исполнитель выбран», «Завершено», «Спор» — только через функции
--     pick_order_master / complete_order (SECURITY DEFINER, current_user
--     там — владелец функции, триггер их пропускает);
--   - исполнителя напрямую менять нельзя; исключение — старые сборки,
--     закрывающие открытое задание «нашёл исполнителя» с выбором из тех,
--     кто действительно откликнулся;
--   - статус меняет только автор (политика orders_picked_master_lifecycle
--     оставалась со старой модели).
-- Функции базы (ночные задачи, удаление аккаунта, админ) не затронуты.
--
-- Плюс reopen_order: отклик исполнителя, выбранного до отмены, гасится.
-- Применено на Beget 2026-09-13.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_order_lifecycle_direct_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (SELECT auth.uid()) IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Статус задания меняет только автор.'
        USING ERRCODE = '42501', DETAIL = 'order_status_owner_only';
    END IF;
    IF NEW.status IN ('in_progress', 'awaiting_confirmation', 'completed', 'disputed') THEN
      RAISE EXCEPTION 'Обновите приложение: этот шаг делается кнопкой в задании.'
        USING ERRCODE = '42501', DETAIL = 'order_lifecycle_via_rpc';
    END IF;
  END IF;

  IF NEW.picked_master_id IS DISTINCT FROM OLD.picked_master_id THEN
    IF NOT (
      OLD.status = 'open'
      AND NEW.status = 'cancelled'
      AND NEW.cancel_reason = 'found_master'
      AND (
        NEW.picked_master_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.order_responses r
           WHERE r.order_id = NEW.id
             AND r.master_id = NEW.picked_master_id
             AND r.status IN ('sent', 'viewed')
        )
      )
    ) THEN
      RAISE EXCEPTION 'Исполнителя выбирают кнопкой в отклике.'
        USING ERRCODE = '42501', DETAIL = 'order_pick_via_rpc';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_lifecycle_direct_update ON public.orders;
CREATE TRIGGER orders_guard_lifecycle_direct_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_lifecycle_direct_update();

CREATE OR REPLACE FUNCTION public.reopen_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_id uuid; v_status public.order_status; v_updated_at timestamptz;
  v_now timestamptz := now(); v_withdrawn_response record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT client_id, status, updated_at INTO v_client_id, v_status, v_updated_at
  FROM public.orders WHERE id = p_order_id;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_client_id != v_user_id THEN RAISE EXCEPTION 'not_order_owner' USING ERRCODE = '42501'; END IF;
  IF v_status NOT IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'order_not_reopenable' USING ERRCODE = 'P0001';
  END IF;
  IF v_updated_at < v_now - interval '7 days' THEN
    RAISE EXCEPTION 'reopen_window_expired' USING ERRCODE = 'P0001';
  END IF;
  -- Исполнитель, выбранный до отмены (0196), снова обычный откликнувшийся:
  -- его отклик отозван, и он получит «Клиент возобновил заказ» вместе с другими.
  UPDATE public.order_responses SET status = 'withdrawn', updated_at = v_now
   WHERE order_id = p_order_id AND status = 'accepted';
  UPDATE public.orders SET status = 'open', cancelled_by = NULL, cancel_reason = NULL,
    picked_master_id = NULL, picked_at = NULL, last_activity_at = v_now,
    expires_at = v_now + interval '14 days', updated_at = v_now
  WHERE id = p_order_id;
  FOR v_withdrawn_response IN
    SELECT master_id FROM public.order_responses WHERE order_id = p_order_id AND status = 'withdrawn' LIMIT 50
  LOOP
    PERFORM public.notify_user(v_withdrawn_response.master_id, 'Клиент возобновил заказ',
      'Заявка снова открыта. Можно откликнуться заново.',
      jsonb_build_object('type', 'order_reopened', 'order_id', p_order_id));
  END LOOP;
  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (p_order_id, v_status, 'open', 'T9', v_user_id, 'user', jsonb_build_object('reopen_window_left_days', 7));
END;
$function$;

COMMIT;
