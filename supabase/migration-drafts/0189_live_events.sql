-- 0189 — живые обновления: база сообщает серверу о новом уведомлении.
--
-- ЗАЧЕМ. Приложение узнавало о новом отклике, отзыве или задании опросом раз
-- в 20 секунд (docs/BACKEND_REWRITE_PLAN.md, этап 4: «позже SSE /v2/events»).
-- DECISION владельца (2026-09-11): «всё, что оставлял невыполненным, тоже
-- выполни». Всё важное уже проходит через notifications (notify_user и
-- рассылка новых заданий), поэтому одного триггера достаточно.
--
-- pg_notify доставляется только после COMMIT: откатанное уведомление
-- сигнала не даёт. В сигнале — только id пользователя, без содержимого;
-- данные приложение забирает обычными запросами под RLS.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_notifications_live_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM pg_notify('xtrud_user_events', NEW.user_id::text);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notifications_live_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS notifications_live_event ON public.notifications;
CREATE TRIGGER notifications_live_event
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_notifications_live_event();

COMMIT;
