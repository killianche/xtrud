-- 0090_notify_masters_on_new_order.sql
-- Sprint 0090 — push мастерам при INSERT нового заказа.
-- AUDIT_LAUNCH_FUNCTIONAL_2026-05-19 #8 (он же LAUNCH_READINESS P0-07).
--
-- Без этого триггера клиент создаёт заявку, видит success-экран «отклики придут
-- за 15-60 мин», но мастера ничего не получают — они узнают про заявку только
-- когда сами зайдут в /orders/search. SLA обманывает.
--
-- Логика матчинга:
--   1. master_categories.l2_id = order.l2_id (категория совпадает).
--   2. master_profiles.status = 'active' (не draft/pending/suspended/archived).
--   3. users.status = 'active' (не banned/deleted/suspended).
--   4. users.is_hidden_from_search = false (мастер не отключил видимость).
--   5. user_id != order.client_id (не уведомлять самого клиента, если он мастер).
--   6. Локация:
--        - если у мастера НЕТ ни одной master_service_areas записи →
--          считаем «работает везде», получает push;
--        - иначе мастер должен иметь city в areas с location_id = order.city_id.
--      (District-level матчинг пока не делаем — district в master_service_areas
--      это широкий район Ингушетии, а order.district — конкретный микрорайон.)
--
-- title push'а: «Новая заявка: <category>» (категория из categories_l2.name_ru).
-- body: order.title trimmed до 80 chars.
-- data: { kind: 'new_order', order_id, l2_id, city_id }
--
-- pg_net.http_post внутри notify_user — async, не блокирует INSERT.

CREATE OR REPLACE FUNCTION public.trg_notify_masters_on_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_name text;
  v_title         text;
  v_body          text;
  v_data          jsonb;
  v_master        record;
BEGIN
  -- Только для свежесозданных open-заявок.
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  -- Подтянем имя категории для красивого title push'а.
  SELECT cl2.name_ru INTO v_category_name
  FROM public.categories_l2 cl2
  WHERE cl2.id = NEW.l2_id;

  v_title := CASE
    WHEN v_category_name IS NOT NULL THEN 'Новая заявка: ' || v_category_name
    ELSE 'Новая заявка'
  END;
  v_body := left(NEW.title, 80);
  v_data := jsonb_build_object(
    'kind',     'new_order',
    'order_id', NEW.id,
    'l2_id',    NEW.l2_id,
    'city_id',  NEW.city_id
  );

  -- Рассылаем подходящим мастерам.
  FOR v_master IN
    SELECT mp.user_id
    FROM public.master_profiles mp
    JOIN public.master_categories mc
         ON mc.master_id = mp.user_id AND mc.l2_id = NEW.l2_id
    JOIN public.users u ON u.id = mp.user_id
    WHERE mp.status = 'active'
      AND u.status = 'active'
      AND COALESCE(mp.is_hidden_from_search, false) = false
      AND mp.user_id <> NEW.client_id
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.master_service_areas msa
          WHERE msa.master_id = mp.user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.master_service_areas msa
          WHERE msa.master_id = mp.user_id
            AND msa.kind = 'city'
            AND msa.location_id = NEW.city_id
        )
      )
  LOOP
    PERFORM public.notify_user(v_master.user_id, v_title, v_body, v_data);
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_notify_masters_on_new_order IS
  'Sprint 0090: AFTER INSERT ON orders → рассылка push матчащим мастерам (категория + локация + active + visible). notify_user является async через pg_net.';

DROP TRIGGER IF EXISTS orders_notify_masters_on_insert ON public.orders;
CREATE TRIGGER orders_notify_masters_on_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_masters_on_new_order();
