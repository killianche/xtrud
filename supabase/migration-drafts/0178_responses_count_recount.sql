-- 0178: счётчик откликов на задании считался только по INSERT/DELETE, а
-- повторный отклик после отзыва (0172) — это UPDATE withdrawn → sent. Итог:
-- responses_count = 0 при живом отклике («Откликов пока нет» на карточке,
-- владелец 2026-09-08). Теперь пересчёт по факту на любое изменение строки.
-- Считаются все отклики, кроме отозванных.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_order_responses_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_order uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE public.orders o
     SET responses_count = (SELECT count(*) FROM public.order_responses r
                             WHERE r.order_id = v_order AND r.status <> 'withdrawn')
   WHERE o.id = v_order;
  IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    UPDATE public.orders o
       SET responses_count = (SELECT count(*) FROM public.order_responses r
                               WHERE r.order_id = OLD.order_id AND r.status <> 'withdrawn')
     WHERE o.id = OLD.order_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS order_responses_update_count ON public.order_responses;
CREATE TRIGGER order_responses_update_count
  AFTER INSERT OR UPDATE OF status, order_id OR DELETE ON public.order_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_order_responses_count();
-- Исправляем накопившиеся расхождения.
UPDATE public.orders o
   SET responses_count = sub.n
  FROM (SELECT o2.id, (SELECT count(*) FROM public.order_responses r WHERE r.order_id = o2.id AND r.status <> 'withdrawn') AS n
          FROM public.orders o2) sub
 WHERE sub.id = o.id AND o.responses_count IS DISTINCT FROM sub.n;
COMMIT;
