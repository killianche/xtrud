-- 0235: в журнале назначения категории админом — название задания (TASKS
-- №270, 2026-10-07: «когда выбираем категорию для задания, это где-нибудь
-- записывается, чтобы потом сделать аналитику и доработать подбор»).
--
-- admin_set_order_category (0230) и так пишет admin_actions
-- 'order_set_category' с from/to. Не хватало текста: задание потом правят
-- или удаляют, и пара «слова → категория» терялась. Теперь в details —
-- title на момент назначения. Описание не пишем: в нём бывают телефоны.
-- Права, проверки и тело — без изменений, кроме трёх строк с v_title.
--
-- Разбор (только админ/сервер):
--   SELECT performed_at, details->>'title' AS title, details->>'from' AS was,
--          details->>'to' AS l2
--     FROM public.admin_actions WHERE action = 'order_set_category'
--    ORDER BY performed_at DESC;
--
-- Откат: 0235_rollback — прежнее тело функции (md5 adb31949…).

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.admin_set_order_category(uuid,text,text)'::regprocedure))
     <> 'adb319490557d399a8b80cc786af8fd7' THEN
    RAISE EXCEPTION '0235: admin_set_order_category изменилась после 0230 — сверить вручную';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_order_category(p_order_id uuid, p_l2_id text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old text;
  v_title text;
  v_status public.order_status;
  v_name text;
  v_rb_before timestamptz;
  v_rb_after timestamptz;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  IF p_l2_id IS NULL OR p_l2_id = 'uncategorized' THEN
    RAISE EXCEPTION 'bad_category' USING errcode = '22023';
  END IF;
  SELECT c.name_ru INTO v_name FROM public.categories_l2 c
   WHERE c.id = p_l2_id AND c.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002';
  END IF;

  SELECT o.l2_id, o.status, o.title INTO v_old, v_status, v_title
    FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  IF v_old = p_l2_id THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'l2_id', p_l2_id, 'changed', false,
                              'notified', false);
  END IF;

  -- «Специалисты уведомлены» — только если рассылка действительно встала в
  -- очередь сейчас (повторная рассылка — одна на задание, F1/INFO-1).
  SELECT e.rebroadcast_at INTO v_rb_before
    FROM xtrud_private.order_uncategorized_events e WHERE e.order_id = p_order_id;

  UPDATE public.orders SET l2_id = p_l2_id WHERE id = p_order_id;

  SELECT e.rebroadcast_at INTO v_rb_after
    FROM xtrud_private.order_uncategorized_events e WHERE e.order_id = p_order_id;

  PERFORM public.admin_log_action(
    'order_set_category', 'order', p_order_id, v_reason, NULL,
    jsonb_build_object('from', v_old, 'to', p_l2_id, 'status', v_status, 'title', v_title));

  RETURN jsonb_build_object(
    'order_id', p_order_id, 'l2_id', p_l2_id, 'l2_name', v_name, 'changed', true,
    'notified', (v_status = 'open' AND v_rb_before IS NULL AND v_rb_after IS NOT NULL));
END;
$function$;

COMMIT;
