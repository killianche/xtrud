-- 0208: выбор исполнителя сразу закрывает задание.
--
-- DECISION владельца 2026-09-30 (скриншоты экрана задания): «Если я выбрал
-- мастера, значит, задание автоматически должно быть закрыто». Блоки
-- «Задание открыто / Закрыть задание», «Исполнитель выбран / Работа
-- выполнена», «Срок истёк / Открыть заново» из приложения убраны.
--
-- Было (0196): pick_order_master → in_progress, затем отдельная кнопка
-- «Работа выполнена» (complete_order) → completed.
-- Стало: pick_order_master в одной транзакции делает оба шага:
--   1) open → in_progress с picked_master_id (триггер присылает выбранному
--      «Вас выбрали исполнителем», как раньше);
--   2) in_progress → completed (completion_kind = 'client_confirmed'),
--      остальные активные отклики снимаются, closed_deals +1.
-- Второго уведомления («Клиент отметил работу выполненной») нет — человек
-- уже получил «Вас выбрали».
-- Отзыв исполнителю доступен сразу: он и так разрешён по completed +
-- picked_master_id (0196–0198).
-- complete_order / unpick_order_master остаются для старых сборок.
--
-- Данные: задания, где исполнитель уже выбран, но работа не отмечена
-- (status = in_progress), закрываются тем же способом (на 2026-09-30 — 1).
--
-- Откат: вернуть тело pick_order_master из 0196 (UPDATE только до
-- in_progress); закрытые этой миграцией задания остаются закрытыми.

BEGIN;

CREATE OR REPLACE FUNCTION public.pick_order_master(p_order_id uuid, p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_master uuid;
  v_resp_status public.response_status;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.client_id <> v_caller THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Исполнителя можно выбрать только в открытом задании.'
      USING ERRCODE = 'P0001', DETAIL = 'order_not_open';
  END IF;

  SELECT master_id, status INTO v_master, v_resp_status
    FROM public.order_responses
   WHERE id = p_response_id AND order_id = p_order_id
   FOR UPDATE;
  IF v_master IS NULL OR v_resp_status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'Этот отклик уже неактуален. Обновите экран.'
      USING ERRCODE = 'P0001', DETAIL = 'response_not_active';
  END IF;

  UPDATE public.order_responses SET status = 'accepted' WHERE id = p_response_id;

  -- Шаг 1: trg_notify_order_accepted поздравит выбранного специалиста.
  UPDATE public.orders
     SET status = 'in_progress',
         picked_master_id = v_master,
         picked_at = now(),
         last_activity_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

  -- Шаг 2: задание закрыто сразу (DECISION 2026-09-30).
  PERFORM public._close_picked_order(p_order_id);
END;
$function$;

-- Закрытие задания с выбранным исполнителем: общий шаг для выбора и для
-- переноса старых in_progress. Без уведомлений.
CREATE OR REPLACE FUNCTION public._close_picked_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_master uuid;
BEGIN
  UPDATE public.orders
     SET status = 'completed',
         completed_at = now(),
         completion_kind = 'client_confirmed',
         last_activity_at = now(),
         updated_at = now()
   WHERE id = p_order_id
     AND status = 'in_progress'
     AND picked_master_id IS NOT NULL
  RETURNING picked_master_id INTO v_master;
  IF v_master IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.order_responses
     SET status = 'withdrawn', updated_at = now()
   WHERE order_id = p_order_id AND status IN ('sent', 'viewed');

  UPDATE public.master_profiles
     SET closed_deals = closed_deals + 1, updated_at = now()
   WHERE user_id = v_master;
END;
$function$;

REVOKE ALL ON FUNCTION public._close_picked_order(uuid) FROM PUBLIC, anon, authenticated;

-- Уже выбранные, но не закрытые задания — закрыть по новой модели.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.orders WHERE status = 'in_progress' AND picked_master_id IS NOT NULL
  LOOP
    PERFORM public._close_picked_order(v_id);
  END LOOP;
END;
$$;

COMMIT;
