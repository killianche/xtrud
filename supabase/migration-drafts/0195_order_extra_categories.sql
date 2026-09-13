-- 0195: задание в нескольких категориях (владелец, 2026-09-13: «чтобы
-- задание можно было выложить в двух или трёх категориях»).
--
-- Модель: l2_id остаётся основной категорией (карточки, отклики, отзывы,
-- рейтинг — всё как было), extra_l2_ids — до двух дополнительных. Задание
-- видят и получают рассылку мастера любой из них.
--
-- Триггер нормализует список: без пустых и повторов, без основной, не больше
-- двух, только существующие активные категории. Приложение шлёт как есть.
-- Применено на Beget 2026-09-13.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS extra_l2_ids text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS orders_extra_l2_ids_gin ON public.orders USING gin (extra_l2_ids);

CREATE OR REPLACE FUNCTION public.orders_normalize_extra_l2_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ids text[];
BEGIN
  SELECT COALESCE(array_agg(x ORDER BY first_pos), '{}')
    INTO v_ids
    FROM (
      SELECT btrim(x) AS x, min(pos) AS first_pos
        FROM unnest(COALESCE(NEW.extra_l2_ids, '{}')) WITH ORDINALITY AS t(x, pos)
       WHERE x IS NOT NULL AND btrim(x) <> '' AND btrim(x) <> NEW.l2_id
       GROUP BY btrim(x)
    ) s;

  IF cardinality(v_ids) > 2 THEN
    RAISE EXCEPTION 'У задания может быть не больше трёх категорий.'
      USING ERRCODE = '22023', DETAIL = 'too_many_categories';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS x
     WHERE NOT EXISTS (SELECT 1 FROM public.categories_l2 c WHERE c.id = x AND c.is_active)
  ) THEN
    RAISE EXCEPTION 'Одна из категорий больше не доступна. Выберите категории заново.'
      USING ERRCODE = '23503', DETAIL = 'category_not_found';
  END IF;

  NEW.extra_l2_ids := v_ids;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_normalize_extra_l2_ids ON public.orders;
CREATE TRIGGER orders_normalize_extra_l2_ids
  BEFORE INSERT OR UPDATE OF extra_l2_ids, l2_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_normalize_extra_l2_ids();

-- Права у authenticated на orders — по колонкам (см. column_privileges).
GRANT SELECT (extra_l2_ids), INSERT (extra_l2_ids), UPDATE (extra_l2_ids)
  ON public.orders TO authenticated;

-- Рассылка «Новая заявка» — мастерам любой из категорий задания.
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
                 AND public.area_covers_place(msa.kind::text, msa.location_id, v_order.city_id, v_order.district)
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

COMMIT;
