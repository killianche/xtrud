-- 0210: специалисту — тишина после отклика; «Найти задание» гасит рассылку.
--
-- DECISION владельца 2026-10-03 (очередь №159): «для специалиста, если
-- откликнулся — всё, никаких уведомлений, что задача открыта, закрыта и так
-- далее; захотят работать — сами позвонят». Выбор исполнителя и так
-- закрывает задание (0208), остальным откликнувшимся уведомлений нет (0202).
-- Последний статусный сигнал специалисту — «Клиент отменил задание»
-- выбранному исполнителю — убран. «Вас выбрали исполнителем»
-- (trg_notify_order_accepted) не трогается: вопрос владельцу в отчёте.
--
-- Очередь №160 («красная точка, а непонятно где»): уведомления рассылки
-- новых заданий (data.kind = 'new_order') сидели непрочитанными в цифре на
-- иконке и на колокольчике, хотя человек уже открыл «Найти задание» — её
-- бейдж гас по last_seen_feed_at, а уведомления нет. mark_feed_seen теперь
-- отмечает их прочитанными тем же вызовом.
--
-- Было → стало:
--   trg_notify_order_cancelled_or_expired: без notify_user исполнителю;
--     клиенту об истечении срока и снятие активных откликов — как было.
--   mark_feed_seen: + UPDATE notifications SET read_at (свои, kind=new_order).
-- Откат: вернуть тела функций из живого дампа pre-0210 (pg_get_functiondef).

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_notify_order_cancelled_or_expired()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_title text := LEFT(COALESCE(NEW.title, ''), 120);
BEGIN
  IF NEW.status NOT IN ('cancelled', 'expired')
     OR COALESCE(OLD.status::text, '') = NEW.status::text THEN
    RETURN NEW;
  END IF;

  -- Специалисту статус задания не сообщается (DECISION 2026-10-03, 0210).

  -- Клиенту — что задание снято и сколько есть времени вернуть его
  -- (reopen_order: 7 дней от момента, когда срок истёк).
  IF NEW.status = 'expired' THEN
    PERFORM public.notify_user(
      NEW.client_id, 'Срок задания истёк',
      v_order_title || E'\nЗадание снято с публикации. Открыть заново можно в течение 7 дней.',
      jsonb_build_object('type', 'order_expired', 'order_id', NEW.id));
  END IF;

  UPDATE public.order_responses
     SET status = 'withdrawn', updated_at = now()
   WHERE order_id = NEW.id
     AND status IN ('sent', 'viewed');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_feed_seen()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.users
    SET last_seen_feed_at = now()
    WHERE id = (SELECT auth.uid());

  -- Рассылка новых заданий прочитана вместе с лентой (0210).
  UPDATE public.notifications
     SET read_at = now()
   WHERE user_id = (SELECT auth.uid())
     AND read_at IS NULL
     AND data->>'kind' = 'new_order';
END;
$function$;

COMMIT;
