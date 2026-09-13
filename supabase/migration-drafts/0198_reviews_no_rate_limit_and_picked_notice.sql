-- 0198: отзывы без лимита «раз в три дня» и понятное уведомление выбранному
-- исполнителю (владелец, 2026-09-13).
--
-- 1. Лимит «один отзыв в три дня» (0191) был защитой от накрутки, пока отзыв
--    можно было оставить кому угодно. С 0196 отзыв — только по завершённому
--    заданию и один на задание, поэтому лимит лишь мешал: два задания,
--    завершённые в один день, — второй отзыв через три дня.
-- 2. «Вас выбрали исполнителем» — одинаково для нового выбора и для старых
--    сборок («Клиент отметил вас исполнителем … Задание закрыто»), с
--    названием задания во второй строке.
-- Применено на Beget 2026-09-13.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_master_review(p_target_id uuid, p_rating integer, p_text text DEFAULT NULL::text, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_author_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_review_id uuid;
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация' USING ERRCODE = '28000';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Оценка должна быть от 1 до 5' USING ERRCODE = '23514';
  END IF;

  -- DECISION владельца 2026-09-13: отзыв — только после завершённого
  -- задания, и только тому, кого выбрали исполнителем.
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  END IF;
  IF p_order_id IS NULL OR v_order.id IS NULL
     OR v_order.client_id <> v_author_id
     OR v_order.picked_master_id IS DISTINCT FROM p_target_id
     OR v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'Отзыв можно оставить, когда задание с этим специалистом завершено.'
      USING ERRCODE = '23514', DETAIL = 'review_requires_completed_order';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reviews WHERE order_id = p_order_id AND author_id = v_author_id) THEN
    RAISE EXCEPTION 'Вы уже оставили отзыв по этому заданию.'
      USING ERRCODE = '23505', DETAIL = 'review_exists';
  END IF;

  INSERT INTO public.reviews (order_id, author_id, target_id, l2_id, direction, rating, text)
  VALUES (p_order_id, v_author_id, p_target_id, v_order.l2_id, 'client_to_master', p_rating,
          NULLIF(trim(coalesce(p_text, '')), ''))
  RETURNING id INTO v_review_id;
  RETURN v_review_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_order_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF (
       NEW.status = 'in_progress' AND COALESCE(OLD.status::text, '') <> 'in_progress'
       AND NEW.picked_master_id IS NOT NULL
     ) OR (
       -- Старые сборки: закрытие «нашёл исполнителя» с выбором откликнувшегося.
       NEW.status = 'cancelled' AND NEW.cancel_reason = 'found_master'
       AND NEW.picked_master_id IS NOT NULL
       AND OLD.picked_master_id IS DISTINCT FROM NEW.picked_master_id
     ) THEN
    PERFORM public.notify_user(
      NEW.picked_master_id,
      'Вас выбрали исполнителем',
      'Задание: ' || LEFT(COALESCE(NEW.title, ''), 110),
      jsonb_build_object('type', 'order_accepted', 'order_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
