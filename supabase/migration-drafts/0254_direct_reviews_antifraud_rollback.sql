-- Откат 0254: прежние тела recalc_master_rating и reviews_insert_participant,
-- рейтинг пересчитан по прежней формуле (все visible-отзывы), новые функции,
-- таблицы, триггеры (notification_tokens_history, users_purge_token_history),
-- задание pg_cron nightly_prune_token_history и индекс удаляются.
--
-- Отзывы без задания, оставленные после 0254, НЕ удаляются: это данные
-- пользователей. Их статус остаётся как есть (pending — до решения в админке,
-- через admin_list_reviews / admin_set_review_status). После отката они снова
-- войдут в рейтинг, если visible. Признаки из review_flags теряются вместе с
-- таблицей — при необходимости сохранить их до отката:
--   COPY (SELECT * FROM public.review_flags) TO STDOUT WITH CSV HEADER;
--
-- Перед откатом приложение должно перестать звать submit_direct_review
-- (иначе ответ 404 «Нет такой функции» из xtrud-api / ошибка PostgREST).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0254r_must_run_as_postgres';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_suspicious_specialists(integer);
DROP FUNCTION IF EXISTS public.admin_list_flagged_reviews();
DROP FUNCTION IF EXISTS public.submit_direct_review(uuid, integer, text);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nightly_prune_token_history';
DROP TRIGGER IF EXISTS users_purge_token_history ON public.users;
DROP FUNCTION IF EXISTS public.trg_users_purge_token_history();
DROP TRIGGER IF EXISTS notification_tokens_history ON public.notification_tokens;
DROP FUNCTION IF EXISTS public.trg_notification_token_history();
DROP TABLE IF EXISTS public.notification_token_history;
DROP TABLE IF EXISTS public.review_flags;

DROP INDEX IF EXISTS public.reviews_direct_author_target_key;

ALTER POLICY reviews_insert_participant ON public.reviews
  WITH CHECK (((( SELECT auth.uid() AS uid) = author_id) AND (author_id <> target_id) AND (EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = reviews.order_id) AND (orders.status = 'completed'::order_status) AND ((orders.completed_at IS NULL) OR ((orders.completed_at + '14 days'::interval) > now())) AND (((orders.client_id = reviews.author_id) AND (orders.picked_master_id = reviews.target_id)) OR ((orders.picked_master_id = reviews.author_id) AND (orders.client_id = reviews.target_id))))))));

CREATE OR REPLACE FUNCTION public.recalc_master_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

DO $$
DECLARE
  v_changed int;
BEGIN
  WITH agg AS (
    SELECT target_id,
           ROUND(AVG(rating)::numeric, 1)::numeric(2,1) AS avg,
           COUNT(*)::int AS cnt
      FROM public.reviews
     WHERE direction = 'client_to_master' AND status = 'visible'
     GROUP BY target_id
  ), want AS (
    SELECT mp.user_id, agg.avg, COALESCE(agg.cnt, 0) AS cnt
      FROM public.master_profiles mp
      LEFT JOIN agg ON agg.target_id = mp.user_id
  )
  UPDATE public.master_profiles mp
     SET rating_overall_avg = want.avg,
         rating_overall_count = want.cnt
    FROM want
   WHERE want.user_id = mp.user_id
     AND (mp.rating_overall_avg IS DISTINCT FROM want.avg
          OR mp.rating_overall_count IS DISTINCT FROM want.cnt);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RAISE NOTICE '0254r: рейтинг пересчитан у % специалистов', v_changed;
END;
$$;

-- Самопроверка: тела совпадают с живыми отпечатками до 0254.
DO $$
BEGIN
  IF (SELECT md5(pg_get_expr(polwithcheck, polrelid)) FROM pg_policy
       WHERE polrelid = 'public.reviews'::regclass AND polname = 'reviews_insert_participant')
     IS DISTINCT FROM '83ea86fd61effb7ac38907a687435ec7' THEN
    RAISE EXCEPTION '0254r_insert_policy_md5';
  END IF;
  IF md5(pg_get_functiondef('public.recalc_master_rating()'::regprocedure))
     IS DISTINCT FROM '51618b72977de41a744ae07e71c14ee4' THEN
    RAISE EXCEPTION '0254r_recalc_md5';
  END IF;
  IF to_regclass('public.review_flags') IS NOT NULL
     OR to_regclass('public.notification_token_history') IS NOT NULL
     OR to_regclass('public.reviews_direct_author_target_key') IS NOT NULL
     OR to_regprocedure('public.submit_direct_review(uuid,integer,text)') IS NOT NULL
     OR to_regprocedure('public.trg_users_purge_token_history()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly_prune_token_history') THEN
    RAISE EXCEPTION '0254r_leftovers';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
