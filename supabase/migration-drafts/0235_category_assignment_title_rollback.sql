-- Откат 0235: прежнее тело admin_set_order_category (0230).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_order_category(p_order_id uuid, p_l2_id text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old text;
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

  SELECT o.l2_id, o.status INTO v_old, v_status
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
    jsonb_build_object('from', v_old, 'to', p_l2_id, 'status', v_status));

  RETURN jsonb_build_object(
    'order_id', p_order_id, 'l2_id', p_l2_id, 'l2_name', v_name, 'changed', true,
    'notified', (v_status = 'open' AND v_rb_before IS NULL AND v_rb_after IS NOT NULL));
END;
$function$;

COMMIT;
