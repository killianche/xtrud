-- 0163 — рассылка «новое задание» специалистам уходит из транзакции публикации.
--
-- FACT (pg_proc, 2026-09-06): триггер orders_notify_masters_on_insert обходил
-- ВСЕХ активных специалистов категории и на каждого звал notify_user —
-- INSERT в notifications + чтение секрета из vault + net.http_post — прямо
-- внутри INSERT задания. При 200 специалистах в категории кнопка
-- «Опубликовать» ждала 200 таких шагов. Это O(специалистов) на самой
-- чувствительной кнопке приложения (design-quality §1.2).
--
-- Теперь триггер кладёт ОДНУ строку в очередь, а разбирает её pg_cron раз в
-- минуту батчами. Публикация снова стоит одну вставку; уведомления
-- специалистам приходят в течение минуты (лента у них обновляется и так —
-- по таблице orders). Логика отбора получателей перенесена без изменений.

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_broadcast_queue (
  order_id   uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  queued_at  timestamptz NOT NULL DEFAULT now(),
  attempts   int NOT NULL DEFAULT 0
);
REVOKE ALL ON public.order_broadcast_queue FROM PUBLIC, anon, authenticated;
ALTER TABLE public.order_broadcast_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.trg_notify_masters_on_new_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.order_broadcast_queue (order_id) VALUES (NEW.id)
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_order_broadcast_queue(p_batch int DEFAULT 20)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item record;
  v_order public.orders%ROWTYPE;
  v_category_name text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_master record;
  v_done int := 0;
BEGIN
  FOR v_item IN
    SELECT order_id FROM public.order_broadcast_queue
    WHERE attempts < 3
    ORDER BY queued_at
    LIMIT p_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
    -- Задание уже закрыто или удалено — рассылать нечего.
    IF NOT FOUND OR v_order.status <> 'open' THEN
      DELETE FROM public.order_broadcast_queue WHERE order_id = v_item.order_id;
      CONTINUE;
    END IF;

    SELECT cl2.name_ru INTO v_category_name FROM public.categories_l2 cl2 WHERE cl2.id = v_order.l2_id;
    v_title := CASE WHEN v_category_name IS NOT NULL THEN 'Новая заявка: ' || v_category_name ELSE 'Новая заявка' END;
    v_body := left(v_order.title, 80);
    v_data := jsonb_build_object('kind', 'new_order', 'order_id', v_order.id, 'l2_id', v_order.l2_id, 'city_id', v_order.city_id);

    BEGIN
      FOR v_master IN
        SELECT mp.user_id
        FROM public.master_profiles mp
        JOIN public.master_categories mc ON mc.master_id = mp.user_id AND mc.l2_id = v_order.l2_id
        JOIN public.users u ON u.id = mp.user_id
        WHERE mp.status = 'active'
          AND u.status = 'active'
          AND COALESCE(mp.is_hidden_from_search, false) = false
          AND mp.user_id <> v_order.client_id
          AND (
            NOT EXISTS (SELECT 1 FROM public.master_service_areas msa WHERE msa.master_id = mp.user_id)
            OR EXISTS (
              SELECT 1 FROM public.master_service_areas msa
              WHERE msa.master_id = mp.user_id AND msa.kind = 'city' AND msa.location_id = v_order.city_id
            )
          )
      LOOP
        PERFORM public.notify_user(v_master.user_id, v_title, v_body, v_data);
      END LOOP;
      DELETE FROM public.order_broadcast_queue WHERE order_id = v_item.order_id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.order_broadcast_queue SET attempts = attempts + 1 WHERE order_id = v_item.order_id;
      RAISE WARNING 'order_broadcast %: %', v_item.order_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_done;
END;
$$;
REVOKE ALL ON FUNCTION public.process_order_broadcast_queue(int) FROM PUBLIC, anon, authenticated;

-- Разбор очереди раз в минуту (минимальный шаг pg_cron).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'order_broadcasts';
SELECT cron.schedule('order_broadcasts', '* * * * *', 'SELECT public.process_order_broadcast_queue(20);');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'order_broadcasts') THEN
    RAISE EXCEPTION 'order_broadcasts_job_missing';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname='trg_notify_masters_on_new_order') NOT LIKE '%order_broadcast_queue%' THEN
    RAISE EXCEPTION 'broadcast_trigger_not_replaced';
  END IF;
END $$;

COMMIT;
