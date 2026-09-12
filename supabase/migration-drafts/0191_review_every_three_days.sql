-- 0191 — один отзыв в три дня вместо одного в неделю.
--
-- DECISION владельца (2026-09-12): «сделай, чтобы один отзыв в три дня».
--
-- Смысл ограничения прежний (Р2, 0175): один отзыв от человека за период —
-- любому специалисту, без привязки к заданию. Оно защищает от накрутки
-- рейтинга: один аккаунт не может за вечер поставить десять оценок.
--
-- Владелец видел на экране «Один отзыв в 30 дней» — это был устаревший текст
-- в приложении: в базе стояло 7 дней. Теперь везде три дня (FACT 2026-09-12).

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_master_review(
  p_target_id uuid,
  p_rating integer,
  p_text text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_author_id uuid := auth.uid();
  v_review_id uuid;
  v_recent_count int;
  v_target_is_master boolean;
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация' USING ERRCODE = '28000';
  END IF;
  IF v_author_id = p_target_id THEN
    RAISE EXCEPTION 'Нельзя оставить отзыв самому себе' USING ERRCODE = '23514';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Оценка должна быть от 1 до 5' USING ERRCODE = '23514';
  END IF;
  SELECT is_master INTO v_target_is_master FROM public.users WHERE id = p_target_id;
  IF v_target_is_master IS NULL OR v_target_is_master = false THEN
    RAISE EXCEPTION 'Можно оставить отзыв только специалисту' USING ERRCODE = '23514';
  END IF;
  -- DECISION владельца 2026-09-12: один отзыв в три дня от каждого человека.
  SELECT count(*) INTO v_recent_count
    FROM public.reviews
   WHERE author_id = v_author_id
     AND direction = 'client_to_master'
     AND created_at > now() - interval '3 days';
  IF v_recent_count > 0 THEN
    RAISE EXCEPTION 'Один отзыв в три дня. Следующий можно оставить чуть позже.'
      USING ERRCODE = '23505', DETAIL = 'review_rate_limit';
  END IF;
  INSERT INTO public.reviews (order_id, author_id, target_id, l2_id, direction, rating, text)
  VALUES (NULL, v_author_id, p_target_id, NULL, 'client_to_master', p_rating,
          NULLIF(trim(coalesce(p_text, '')), ''))
  RETURNING id INTO v_review_id;
  RETURN v_review_id;
END;
$$;

COMMIT;
