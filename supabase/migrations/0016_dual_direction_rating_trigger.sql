-- Migration 0016 — расширяем rating trigger на оба направления.
--
-- Sprint 8.4:
-- - direction='client_to_master' (как и было): пересчёт master_profiles.rating_overall_avg/count.
-- - direction='master_to_client' (новое): пересчёт users.rating_as_client_avg/count.
--
-- Поля rating_as_client_avg + rating_as_client_count существовали с 0001 (изначально
-- задумывались для двунаправленного рейтинга), но trigger пересчёта их не трогал.

CREATE OR REPLACE FUNCTION public.recalc_master_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target    uuid;
  v_direction public.review_direction;
  v_avg       numeric(2,1);
  v_count     int;
BEGIN
  v_target := COALESCE(NEW.target_id, OLD.target_id);
  v_direction := COALESCE(NEW.direction, OLD.direction);

  IF v_target IS NULL OR v_direction IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    ROUND(AVG(rating)::numeric, 1)::numeric(2,1),
    COUNT(*)
  INTO v_avg, v_count
  FROM public.reviews
  WHERE target_id = v_target
    AND direction = v_direction
    AND status = 'visible';

  IF v_direction = 'client_to_master' THEN
    UPDATE public.master_profiles
      SET rating_overall_avg = v_avg,
          rating_overall_count = COALESCE(v_count, 0)
      WHERE user_id = v_target;
  ELSIF v_direction = 'master_to_client' THEN
    UPDATE public.users
      SET rating_as_client_avg = v_avg,
          rating_as_client_count = COALESCE(v_count, 0)
      WHERE id = v_target;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.recalc_master_rating IS
  'Trigger function на reviews: пересчёт рейтинга target_id с учётом direction. client_to_master → master_profiles, master_to_client → users.rating_as_client_*.';
