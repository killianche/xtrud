-- 0156 — повторный отзыв отклика больше не ошибка.
--
-- ЗАЧЕМ (FACT, 2026-09-05). Владелец отозвал отклик и увидел на экране
-- `cannot_withdraw_after_decision`. В базе при этом всё прошло: статус отклика
-- 68075288 стал `withdrawn`, updated_at совпадает с минутой на скриншоте.
--
-- То есть отзыв сработал, а экран об этом не узнал (это чинится в приложении,
-- см. use-withdraw-response.ts) — и второе нажатие ушло на сервер по уже
-- отозванному отклику.
--
-- Функция отвечала отказом, потому что проверяла статус одним условием:
-- «не sent и не viewed — значит решение уже принято». Но `withdrawn` — это не
-- чужое решение, это тот же самый результат, которого человек и добивается.
-- Просить второй раз то, что уже сделано, — не ошибка.
--
-- Что меняется: отзыв уже отозванного отклика завершается тихо и успешно,
-- повторное уведомление клиенту при этом НЕ уходит. Отказ остаётся там, где он
-- по делу: отклик принят или отклонён клиентом — тогда решение действительно
-- принял не отзывающий.

BEGIN;

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

  -- Уже отозван — нужный итог достигнут. Молча выходим: ни повторной записи,
  -- ни второго уведомления клиенту.
  IF v_current_status = 'withdrawn' THEN
    RETURN;
  END IF;

  -- Отказ остаётся только там, где решение принял клиент.
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
  'Мастер отзывает свой отклик. Из sent/viewed. Повторный отзыв уже отозванного — тихий успех (0156). Уведомляет клиента.';

REVOKE EXECUTE ON FUNCTION public.withdraw_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_response(uuid) TO authenticated;

-- Проверка: правка должна быть в теле функции, а не в намерении.
DO $$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'withdraw_response';
  IF v_src IS NULL OR position('IF v_current_status = ''withdrawn'' THEN' IN v_src) = 0 THEN
    RAISE EXCEPTION 'withdraw_response_idempotency_not_applied';
  END IF;
END $$;

COMMIT;
