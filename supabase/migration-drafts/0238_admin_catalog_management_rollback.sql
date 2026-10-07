-- Откат 0238: управление каталогом из админки.
--
-- Удаляет новые функции, таблицу отметок рассылки, переадресацию слитых
-- категорий (таблица и триггеры) и индекс notifications_new_order_idx;
-- admin_list_categories и process_order_broadcast_queue возвращаются в
-- редакции до 0238 (проверка по md5, права прежние).
-- Внимание: после отката старые сборки снова могут ставить id слитых
-- категорий (FK есть, строка from цела; normalize отвергнет её только как
-- дополнительную).
-- Не возвращает данные: слияния и переносы, сделанные через 0238, остаются —
-- журнал admin_actions (category_merge: main_order_ids / extra_order_ids,
-- order_set_category: from/to) хранит всё для ручного возврата.
-- Ограничение admin_actions_action_check остаётся в редакции 0238: журнал
-- append-only, строки с новыми действиями не удаляются.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0238_rollback_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_merge_category(text,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION '0238_not_applied';
  END IF;
END $$;

DROP FUNCTION public.admin_reorder(text, text[], text);
DROP FUNCTION public.admin_rename_section(text, text, text);
DROP FUNCTION public.admin_list_category_orders(text, text, integer);
DROP FUNCTION public.admin_move_orders(uuid[], text, text, boolean);
DROP FUNCTION public.admin_merge_category(text, text, text, boolean);
DROP FUNCTION public.admin_update_category(text, text, text, text, text[], text);
DROP FUNCTION xtrud_private.catalog_requeue_after_move(uuid, text[], boolean);
DROP FUNCTION xtrud_private.catalog_norm_terms(text[]);
DROP FUNCTION xtrud_private.catalog_check_name(text);
DROP TABLE xtrud_private.order_category_broadcasts;
DROP TRIGGER orders_a_category_redirect ON public.orders;
DROP TRIGGER master_categories_a_redirect ON public.master_categories;
DROP TRIGGER master_services_a_redirect ON public.master_services;
DROP FUNCTION xtrud_private.orders_category_redirect();
DROP FUNCTION xtrud_private.master_category_redirect();
DROP FUNCTION xtrud_private.category_resolve(text);
DROP TABLE xtrud_private.category_redirects;

-- Рассылка — живое тело до 0238 (md5 4ac02f4e403feafb0baba4486b971f6a).
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
    -- Задание уже закрыто, удалено или скрыто красным флагом (0231) —
    -- рассылать нечего. Открыть скрытое — admin_unhide_order поставит снова.
    IF NOT FOUND OR v_order.status <> 'open'
       OR xtrud_private.order_is_shadow_hidden(v_item.order_id) THEN
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

DROP INDEX public.notifications_new_order_idx;

DROP FUNCTION public.admin_list_categories();

-- Редакция до 0238 (живое тело 2026-10-07, md5 25164883881dd65c1ccb8f9af2671222).
CREATE FUNCTION public.admin_list_categories()
 RETURNS TABLE(l1_id text, l1_name text, l2_id text, l2_name text, is_active boolean, is_visible boolean, sort_order integer, open_orders integer, masters integer, open_responses boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT l1.id, l1.name_ru, l2.id, l2.name_ru, l2.is_active, l2.is_visible, l2.sort_order,
         coalesce(oc.n, 0), coalesce(mc.n, 0), l2.open_responses
    FROM public.categories_l2 l2
    JOIN public.categories_l1 l1 ON l1.id = l2.l1_id
    LEFT JOIN (SELECT o.l2_id, count(*)::int AS n FROM public.orders o
                WHERE o.status = 'open' GROUP BY o.l2_id) oc ON oc.l2_id = l2.id
    LEFT JOIN (SELECT m.l2_id, count(DISTINCT m.master_id)::int AS n FROM public.master_categories m
                GROUP BY m.l2_id) mc ON mc.l2_id = l2.id
   ORDER BY l1.sort_order, l1.id, l2.sort_order, l2.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_categories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_categories() TO authenticated, service_role;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.admin_list_categories()'::regprocedure))
       IS DISTINCT FROM '25164883881dd65c1ccb8f9af2671222'
     OR md5(pg_get_functiondef('public.process_order_broadcast_queue(integer)'::regprocedure))
       IS DISTINCT FROM '4ac02f4e403feafb0baba4486b971f6a'
     OR (SELECT array_to_string(proacl, ',') FROM pg_proc
          WHERE oid = 'public.admin_list_categories()'::regprocedure)
        IS DISTINCT FROM 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION '0238_rollback_list_categories_wrong';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
