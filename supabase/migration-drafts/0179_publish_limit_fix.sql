-- 0179: FACT (2026-09-08, лог nginx: POST /v2/rest/orders → 404, тело
-- «function pg_advisory_xact_lock(bigint, bigint) does not exist»). Триггер
-- лимита публикации из 0175 звал двухаргументную блокировку с bigint —
-- такой формы нет (она int4, int4). Итог: с 2026-09-07 ни одно задание не
-- публиковалось. Владелец: «тестер выложил задания, но они не видны».
-- Исправление: один bigint-ключ. Заодно суточный лимит не считает
-- отменённые задания: ошибочно созданное и тут же закрытое не блокирует
-- человека на сутки.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_today int;
  v_active int;
  v_last timestamptz;
BEGIN
  IF v_actor IS NULL OR NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('orders_publish_limit:' || NEW.client_id::text, 0));

  SELECT count(*), max(created_at) INTO v_today, v_last
    FROM public.orders
   WHERE client_id = NEW.client_id
     AND status NOT IN ('draft', 'cancelled')
     AND created_at > now() - interval '24 hours';
  IF v_today >= 1 THEN
    RAISE EXCEPTION 'Одно задание в день. Следующее можно разместить %',
      to_char((v_last + interval '24 hours') AT TIME ZONE 'Europe/Moscow', 'DD.MM в HH24:MI')
      USING ERRCODE = 'P0001', DETAIL = 'daily_limit';
  END IF;

  SELECT count(*) INTO v_active
    FROM public.orders
   WHERE client_id = NEW.client_id
     AND status IN ('open', 'in_progress', 'awaiting_confirmation');
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'Не больше трёх активных заданий. Закройте одно, чтобы разместить новое.'
      USING ERRCODE = 'P0001', DETAIL = 'active_limit';
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
