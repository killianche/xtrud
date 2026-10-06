-- Откат 0231: убираются словарь и состояние «красного флага», политика,
-- триггеры, админ-RPC; рассылка и события «Без категории» возвращаются к
-- живым телам 0230 (сверка md5 ниже); «Уроки музыки» снова в каталоге со
-- своими словами поиска (те же id строк).
--
-- ВНИМАНИЕ: скрытые задания после отката снова видны всем, но в рассылку
-- специалистам они не попадут (их убрали из очереди) — это осознанно: откат
-- не должен слать push по запрещённым заданиям. Список скрытых до отката:
--   SELECT order_id, topic FROM xtrud_private.order_shadow_hides WHERE cleared_at IS NULL;
-- Если такие задания не должны стать видимыми — до отката закрыть их
-- модерацией (admin_hide_order), это решение владельца.
--
-- Не откатывается (намеренно): ограничение admin_actions_action_check
-- остаётся в редакции 0231 — журнал append-only (admin_actions_no_delete /
-- _no_update), записи order_shadow_hide / order_shadow_unhide удалить нельзя.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0231_rollback_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.order_shadow_hides') IS NULL THEN
    RAISE EXCEPTION '0231_rollback_not_applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.category_terms
              WHERE id IN ('29603423-07ff-457f-b788-884fbbbd6e65', 'de6166ac-a3d4-4df0-904f-8a7342cb2b1f',
                           'b31984d3-c57c-4727-a3eb-82cf794ddf53', 'df45b4d3-4695-423a-94ba-16735da584cd')) THEN
    RAISE EXCEPTION '0231_rollback_terms_present';
  END IF;
END $$;

DROP POLICY IF EXISTS orders_red_flag_restrictive ON public.orders;
DROP TRIGGER IF EXISTS orders_red_flag_check ON public.orders;
DROP TRIGGER IF EXISTS order_responses_red_flag_guard ON public.order_responses;

DROP FUNCTION IF EXISTS public.admin_list_shadow_hidden_orders(integer);
DROP FUNCTION IF EXISTS public.admin_unhide_order(uuid, text);
DROP FUNCTION IF EXISTS public.admin_hide_order_shadow(uuid, text);

-- Живые тела 0230 (pg_get_functiondef, 2026-10-06).
CREATE OR REPLACE FUNCTION public.process_order_broadcast_queue(p_batch integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        JOIN public.users u ON u.id = mp.user_id
        WHERE mp.status = 'active'
          -- Мастер любой из категорий задания (0195), одно уведомление на человека.
          AND EXISTS (
            SELECT 1 FROM public.master_categories mc
             WHERE mc.master_id = mp.user_id
               AND (mc.l2_id = v_order.l2_id OR mc.l2_id = ANY (v_order.extra_l2_ids))
          )
          AND u.status = 'active'
          AND COALESCE(mp.is_hidden_from_search, false) = false
          AND mp.user_id <> v_order.client_id
          AND (
            -- Зон нет — работает по всей Ингушетии.
            NOT EXISTS (SELECT 1 FROM public.master_service_areas msa WHERE msa.master_id = mp.user_id)
            OR EXISTS (
              SELECT 1 FROM public.master_service_areas msa
               WHERE msa.master_id = mp.user_id
                 -- 0212: район включает свои города и сёла; село — свой район и само село.
                 AND xtrud_private.area_matches_place(msa.kind::text, msa.location_id,
                                                      v_order.city_id, v_order.district, v_order.village)
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
$function$;

CREATE OR REPLACE FUNCTION xtrud_private.orders_uncategorized_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid;
  v_rows int;
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NULL;
  END IF;

  IF NEW.l2_id = 'uncategorized'
     AND (TG_OP = 'INSERT' OR OLD.l2_id IS DISTINCT FROM 'uncategorized') THEN
    INSERT INTO xtrud_private.order_uncategorized_events (order_id)
    VALUES (NEW.id)
    ON CONFLICT (order_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RETURN NULL;  -- по этому заданию админов уже звали
    END IF;
    -- Волна (больше 20 событий за час) — без push, только в админке:
    -- лимиты публикации ограничивают одного человека, а не всех.
    IF (SELECT count(*) FROM xtrud_private.order_uncategorized_events e
         WHERE e.admin_notified_at > now() - interval '1 hour') > 20 THEN
      RETURN NULL;
    END IF;
    FOR v_admin IN
      SELECT u.id FROM public.users u
       WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active'
    LOOP
      BEGIN
        -- Без ключа order_id: он включил бы задание в счётчики «моих
        -- заданий» админа (use-notifications.ts считает строки с order_id).
        PERFORM public.notify_user(
          v_admin,
          'Новое задание без категории',
          left(NEW.title, 80) || ' — откройте админку',
          jsonb_build_object('type', 'system', 'kind', 'uncategorized_order',
                             'uncategorized_order_id', NEW.id));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'uncategorized_order push %: %', NEW.id, SQLERRM;
      END;
    END LOOP;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.l2_id = 'uncategorized'
     AND NEW.l2_id IS DISTINCT FROM 'uncategorized' THEN
    INSERT INTO xtrud_private.order_uncategorized_events AS e (order_id, rebroadcast_at)
    VALUES (NEW.id, now())
    ON CONFLICT (order_id) DO UPDATE SET rebroadcast_at = now()
      WHERE e.rebroadcast_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.order_broadcast_queue (order_id) VALUES (NEW.id)
      ON CONFLICT (order_id) DO UPDATE SET attempts = 0, queued_at = now();
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

DROP FUNCTION IF EXISTS xtrud_private.orders_red_flag_check();
DROP FUNCTION IF EXISTS xtrud_private.order_responses_red_flag_guard();
DROP FUNCTION IF EXISTS xtrud_private.shadow_hidden_order_ids();
DROP FUNCTION IF EXISTS xtrud_private.order_is_shadow_hidden(uuid);
DROP FUNCTION IF EXISTS xtrud_private.red_flag_match(text, text);
DROP TABLE IF EXISTS xtrud_private.order_shadow_hides;
DROP TABLE IF EXISTS xtrud_private.red_flag_terms;

-- Каталог: «Уроки музыки» как до 0231.
UPDATE public.categories_l2 SET is_active = true, is_visible = true, is_featured = false
 WHERE id = 'music-lessons';
UPDATE public.categories_l3 SET is_active = true
 WHERE id IN ('music-guitar', 'music-piano', 'music-vocal');
INSERT INTO public.category_terms (id, l2_id, l3_id, term, weight, created_at) VALUES
  ('29603423-07ff-457f-b788-884fbbbd6e65', 'music-lessons', NULL, 'вокал', 70, '2026-10-01T18:22:46.262263+00:00'),
  ('de6166ac-a3d4-4df0-904f-8a7342cb2b1f', 'music-lessons', NULL, 'гитара', 90, '2026-10-01T18:22:46.262263+00:00'),
  ('b31984d3-c57c-4727-a3eb-82cf794ddf53', 'music-lessons', NULL, 'уроки музыки', 100, '2026-10-01T18:22:46.262263+00:00'),
  ('df45b4d3-4695-423a-94ba-16735da584cd', 'music-lessons', NULL, 'фортепиано', 80, '2026-10-01T18:22:46.262263+00:00');

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.process_order_broadcast_queue(integer)'::regprocedure))
       IS DISTINCT FROM '7bf7c4fa520096615d213e101f6a5154'
     OR md5(pg_get_functiondef('xtrud_private.orders_uncategorized_events()'::regprocedure))
       IS DISTINCT FROM 'fc81688d080fce49e8dc2c112e422710' THEN
    RAISE EXCEPTION '0231_rollback_function_bodies_differ';
  END IF;
  IF to_regclass('xtrud_private.order_shadow_hides') IS NOT NULL
     OR to_regclass('xtrud_private.red_flag_terms') IS NOT NULL
     OR to_regprocedure('public.admin_unhide_order(uuid,text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('orders_red_flag_check', 'order_responses_red_flag_guard'))
     OR EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'orders_red_flag_restrictive')
     OR NOT EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'music-lessons' AND is_active AND is_visible)
     OR (SELECT count(*) FROM public.categories_l3 WHERE l2_id = 'music-lessons' AND is_active) <> 3
     OR (SELECT count(*) FROM public.category_terms WHERE l2_id = 'music-lessons') <> 4 THEN
    RAISE EXCEPTION '0231_rollback_incomplete';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
