-- 0254 — отзыв без задания и защита от накрутки (№356, 2026-10-22).
--
-- Спецификация: docs/REVIEWS_WITHOUT_ORDER_2026-10.md (§0 — решения владельца,
-- §2–4 — правила). Номер 0253 занят (применена и откатана в коде) — не брать.
--
-- DECISION владельца 2026-10-22:
--   * человек, который нашёл специалиста в xtrud, но не создавал задание,
--     может оставить ему отзыв (отменяет 0196 «только по заданию» — для
--     отзывов без задания; отзыв по заданию работает как раньше);
--   * отзыв без задания публикуется сразу, а при признаке накрутки уходит
--     «на проверку» (status = pending) и виден всем после одобрения;
--   * отзыв без задания НЕ идёт в рейтинг специалиста;
--   * в админке — «Подозрительные»: отзывы на проверке и специалисты,
--     которым слишком часто ставят отзывы.
--
-- Было (FACT, живая база 2026-10-22, read-only):
--   * submit_master_review(p_target_id, p_rating, p_text, p_order_id) —
--     только по завершённому заданию (0196); её зовут сборки ≤168 — не трогаем;
--   * recalc_master_rating считает все visible-отзывы, включая 4 старых
--     отзыва без задания (период 0175–0196);
--   * политика reviews_insert_participant + колоночный GRANT INSERT для
--     authenticated: прямая запись в таблицу. WITH CHECK требует EXISTS
--     (orders.id = reviews.order_id …), поэтому строка с order_id NULL уже
--     сейчас не проходит; но это следствие сравнения с NULL, а не явное правило;
--   * notification_tokens.device_token UNIQUE: у одного токена всегда один
--     владелец — общее устройство по текущей таблице не увидеть никогда.
--
-- Стало:
--   1. public.review_flags — признаки накрутки, только персонал (RLS, без грантов
--      anon/authenticated; читают SECURITY DEFINER-функции admin_*).
--   2. public.notification_token_history — кто когда владел push-токеном.
--      Нужна для признака shared_device: без неё он не срабатывает никогда.
--      Только персонал. Наполняется триггером на notification_tokens и разовым
--      переносом текущих строк. Сбой записи истории не ломает регистрацию push.
--      DECISION владельца 2026-10-22: хранится 180 дней — pg_cron
--      nightly_prune_token_history; при удалении аккаунта (delete_my_account
--      ставит users.status = 'deleted', строку не удаляет) история человека
--      стирается триггером users_purge_token_history.
--   3. Частичный уникальный индекс reviews(author_id, target_id) WHERE order_id
--      IS NULL — один отзыв без задания от человека одному специалисту навсегда.
--   4. submit_direct_review(p_target_id, p_rating, p_text) RETURNS jsonb {id,status}.
--   5. recalc_master_rating: client_to_master — только order_id IS NOT NULL;
--      пересчёт рейтинга всех специалистов.
--   6. admin_list_flagged_reviews(), admin_list_suspicious_specialists(p_days).
--   7. reviews_insert_participant: явное «order_id IS NOT NULL», direction связан
--      с ролью в задании (client_to_master — автор заказчик, адресат выбранный
--      исполнитель; master_to_client — наоборот), прочие условия прежние. Путь
--      прямой записи по заданию сохранён (в Git-истории вызовов нет, но сборки
--      до baseline f665c18 — UNKNOWN), отзыв без задания в обход
--      submit_direct_review вставить нельзя.
--   Адресат отзыва без задания — специалист с опубликованным профилем
--   (master_profiles.status = 'active', как в search_masters; DECISION
--   основного агента по ревью xtrud-security 2026-10-22).
--
-- Откат: 0254_direct_reviews_antifraud_rollback.sql (возвращает прежние тела,
-- пересчитывает рейтинг по прежней формуле; отзывы без задания, оставленные
-- после 0254, не удаляются — это данные пользователей).

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Предусловия: живое состояние совпадает с тем, от чего писался черновик.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0254_must_run_as_postgres';
  END IF;
  IF (SELECT md5(pg_get_expr(polwithcheck, polrelid)) FROM pg_policy
       WHERE polrelid = 'public.reviews'::regclass AND polname = 'reviews_insert_participant')
     IS DISTINCT FROM '83ea86fd61effb7ac38907a687435ec7' THEN
    RAISE EXCEPTION '0254_insert_policy_changed';
  END IF;
  IF md5(pg_get_functiondef('public.recalc_master_rating()'::regprocedure))
     IS DISTINCT FROM '51618b72977de41a744ae07e71c14ee4' THEN
    RAISE EXCEPTION '0254_recalc_master_rating_changed';
  END IF;
  IF to_regclass('public.review_flags') IS NOT NULL
     OR to_regclass('public.notification_token_history') IS NOT NULL
     OR to_regclass('public.reviews_direct_author_target_key') IS NOT NULL
     OR to_regprocedure('public.submit_direct_review(uuid,integer,text)') IS NOT NULL
     OR to_regprocedure('public.admin_list_flagged_reviews()') IS NOT NULL
     OR to_regprocedure('public.admin_list_suspicious_specialists(integer)') IS NOT NULL
     OR to_regprocedure('public.trg_users_purge_token_history()') IS NOT NULL THEN
    RAISE EXCEPTION '0254_already_applied';
  END IF;
  -- Уникальный индекс ниже не должен упасть на текущих данных.
  IF EXISTS (SELECT 1 FROM public.reviews WHERE order_id IS NULL
              GROUP BY author_id, target_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION '0254_duplicate_direct_reviews';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Признаки накрутки — только персонал.
-- ---------------------------------------------------------------------------
CREATE TABLE public.review_flags (
  review_id  uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  code       text NOT NULL
             CHECK (code IN ('new_account', 'shared_device', 'burst', 'mutual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, code)
);
COMMENT ON TABLE public.review_flags IS
  'Признаки накрутки отзыва без задания (0254). Только персонал: автор и адресат '
  'видят отзыв в любом статусе, поэтому признаки не лежат колонкой в reviews.';
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.review_flags FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.review_flags TO service_role;

-- ---------------------------------------------------------------------------
-- 2. История владельцев push-токена (для признака shared_device).
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_token_history (
  device_token  text NOT NULL,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_token, user_id)
);
CREATE INDEX notification_token_history_user_idx
  ON public.notification_token_history (user_id);
COMMENT ON TABLE public.notification_token_history IS
  'Какие аккаунты пользовались одним устройством (push-токен). Только персонал; '
  'признак shared_device отзывов без задания (0254).';
ALTER TABLE public.notification_token_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_token_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.notification_token_history TO service_role;

INSERT INTO public.notification_token_history (device_token, user_id, first_seen_at, last_seen_at)
SELECT t.device_token, t.user_id, t.created_at, t.updated_at
  FROM public.notification_tokens t
  JOIN public.users u ON u.id = t.user_id
 WHERE u.status <> 'deleted'
ON CONFLICT (device_token, user_id) DO NOTHING;

CREATE FUNCTION public.trg_notification_token_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.notification_token_history (device_token, user_id)
    VALUES (NEW.device_token, NEW.user_id)
    ON CONFLICT (device_token, user_id) DO UPDATE SET last_seen_at = now();
  EXCEPTION WHEN OTHERS THEN
    -- Признак для модерации не должен ломать регистрацию уведомлений.
    RAISE WARNING 'trg_notification_token_history: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_notification_token_history() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notification_tokens_history
  AFTER INSERT OR UPDATE OF user_id, device_token ON public.notification_tokens
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_token_history();

-- Удалённый аккаунт: история его устройств стирается сразу.
CREATE FUNCTION public.trg_users_purge_token_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM public.notification_token_history WHERE user_id = NEW.id;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_users_purge_token_history() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER users_purge_token_history
  AFTER UPDATE OF status ON public.users
  FOR EACH ROW
  WHEN (NEW.status = 'deleted'::public.user_status AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_users_purge_token_history();

-- Срок хранения 180 дней (DECISION владельца 2026-10-22). Идемпотентно:
-- прежнее задание с тем же именем снимается.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nightly_prune_token_history';
SELECT cron.schedule(
  'nightly_prune_token_history',
  '55 3 * * *',
  $$DELETE FROM public.notification_token_history WHERE last_seen_at < now() - interval '180 days'$$);

-- ---------------------------------------------------------------------------
-- 3. Один отзыв без задания от человека одному специалисту — навсегда.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX reviews_direct_author_target_key
  ON public.reviews (author_id, target_id)
  WHERE order_id IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Прямая запись в reviews — только по заданию.
-- Прежние условия сохранены; впереди явное order_id IS NOT NULL, direction
-- связан с ролью автора в задании.
-- ---------------------------------------------------------------------------
ALTER POLICY reviews_insert_participant ON public.reviews
  WITH CHECK ((order_id IS NOT NULL) AND ((( SELECT auth.uid() AS uid) = author_id) AND (author_id <> target_id) AND (EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = reviews.order_id) AND (orders.status = 'completed'::order_status) AND ((orders.completed_at IS NULL) OR ((orders.completed_at + '14 days'::interval) > now())) AND (((reviews.direction = 'client_to_master'::review_direction) AND (orders.client_id = reviews.author_id) AND (orders.picked_master_id = reviews.target_id)) OR ((reviews.direction = 'master_to_client'::review_direction) AND (orders.picked_master_id = reviews.author_id) AND (orders.client_id = reviews.target_id))))))));

-- ---------------------------------------------------------------------------
-- 5. Отзыв без задания.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.submit_direct_review(p_target_id uuid, p_rating integer, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_author_id uuid := auth.uid();
  v_text text := btrim(coalesce(p_text, ''));
  v_author public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_flags text[] := ARRAY[]::text[];
  v_status public.review_status;
  v_review_id uuid;
BEGIN
  -- Жёсткие запреты (docs/REVIEWS_WITHOUT_ORDER_2026-10.md §2).
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Войдите, чтобы оставить отзыв.'
      USING ERRCODE = '28000', DETAIL = 'auth_required';
  END IF;

  SELECT * INTO v_author FROM public.users WHERE id = v_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Аккаунт не найден. Войдите заново.'
      USING ERRCODE = '42501', DETAIL = 'account_unknown';
  END IF;
  IF v_author.status <> 'active' THEN
    RAISE EXCEPTION 'Аккаунт ограничен: публикация, предложения и отзывы недоступны. Обратитесь в поддержку.'
      USING ERRCODE = '42501', DETAIL = 'account_not_active';
  END IF;
  IF v_author.is_demo THEN
    RAISE EXCEPTION 'Демо-аккаунт не может оставлять отзывы.'
      USING ERRCODE = '42501', DETAIL = 'review_author_demo';
  END IF;

  IF p_target_id = v_author_id THEN
    RAISE EXCEPTION 'Нельзя оставить отзыв самому себе.'
      USING ERRCODE = '23514', DETAIL = 'review_self';
  END IF;
  SELECT * INTO v_target FROM public.users WHERE id = p_target_id;
  IF NOT FOUND OR NOT v_target.is_master THEN
    RAISE EXCEPTION 'Отзыв можно оставить только специалисту.'
      USING ERRCODE = '23514', DETAIL = 'review_target_not_master';
  END IF;
  -- Только опубликованный в каталоге специалист (как в search_masters).
  IF v_target.is_demo OR v_target.status <> 'active'
     OR NOT EXISTS (SELECT 1 FROM public.master_profiles mp
                     WHERE mp.user_id = p_target_id AND mp.status = 'active') THEN
    RAISE EXCEPTION 'Этому специалисту сейчас нельзя оставить отзыв.'
      USING ERRCODE = '23514', DETAIL = 'review_target_unavailable';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Оценка должна быть от 1 до 5.'
      USING ERRCODE = '23514', DETAIL = 'review_bad_rating';
  END IF;
  IF length(v_text) < 20 THEN
    RAISE EXCEPTION 'Напишите отзыв — хотя бы 20 символов.'
      USING ERRCODE = '23514', DETAIL = 'review_text_too_short';
  END IF;
  IF length(v_text) > 2000 THEN
    RAISE EXCEPTION 'Отзыв слишком длинный — не больше 2000 символов.'
      USING ERRCODE = '23514', DETAIL = 'review_text_too_long';
  END IF;

  -- Параллельные запросы идут по очереди: по автору — иначе два запроса
  -- одновременно обошли бы правило «раз в три дня»; по адресату — иначе
  -- одновременные отзывы разных людей не увидели бы друг друга в признаке burst.
  -- Порядок всегда автор → адресат.
  PERFORM pg_advisory_xact_lock(hashtextextended('submit_direct_review:author:' || v_author_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('submit_direct_review:target:' || p_target_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.reviews
              WHERE author_id = v_author_id AND target_id = p_target_id AND order_id IS NULL) THEN
    RAISE EXCEPTION 'Вы уже оставили отзыв этому специалисту.'
      USING ERRCODE = '23505', DETAIL = 'direct_review_exists';
  END IF;

  -- Прежнее правило владельца 2026-09-12 (0191): один отзыв без задания в три дня.
  IF EXISTS (SELECT 1 FROM public.reviews
              WHERE author_id = v_author_id AND order_id IS NULL
                AND created_at > now() - interval '3 days') THEN
    RAISE EXCEPTION 'Отзыв без задания можно оставлять раз в три дня. Попробуйте позже.'
      USING ERRCODE = '23505', DETAIL = 'review_rate_limit';
  END IF;

  -- Признаки накрутки (§2): отзыв сохраняется, но уходит на проверку.
  IF v_author.created_at > now() - interval '7 days' THEN
    v_flags := v_flags || 'new_account'::text;
  END IF;
  IF EXISTS (SELECT 1
               FROM public.notification_token_history a
               JOIN public.notification_token_history b ON b.device_token = a.device_token
              WHERE a.user_id = v_author_id AND b.user_id = p_target_id) THEN
    v_flags := v_flags || 'shared_device'::text;
  END IF;
  IF (SELECT count(*) FROM public.reviews
       WHERE target_id = p_target_id AND order_id IS NULL
         AND direction = 'client_to_master'
         AND created_at > now() - interval '7 days') >= 3 THEN
    v_flags := v_flags || 'burst'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.reviews
              WHERE author_id = p_target_id AND target_id = v_author_id) THEN
    v_flags := v_flags || 'mutual'::text;
  END IF;

  v_status := CASE WHEN cardinality(v_flags) > 0 THEN 'pending' ELSE 'visible' END;

  BEGIN
    INSERT INTO public.reviews (order_id, author_id, target_id, l2_id, direction, rating, text, status)
    VALUES (NULL, v_author_id, p_target_id, NULL, 'client_to_master', p_rating, v_text, v_status)
    RETURNING id INTO v_review_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Вы уже оставили отзыв этому специалисту.'
      USING ERRCODE = '23505', DETAIL = 'direct_review_exists';
  END;

  INSERT INTO public.review_flags (review_id, code)
  SELECT v_review_id, f FROM unnest(v_flags) AS f;

  RETURN jsonb_build_object('id', v_review_id, 'status', v_status::text);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_direct_review(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_direct_review(uuid, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Рейтинг специалиста — только отзывы по заданию.
-- Тело — живое, плюс условие на order_id для client_to_master.
-- ---------------------------------------------------------------------------
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

  -- DECISION владельца 2026-10-22 (0254): отзыв без задания не идёт в рейтинг
  -- специалиста.
  SELECT
    ROUND(AVG(rating)::numeric, 1)::numeric(2,1),
    COUNT(*)
  INTO v_avg, v_count
  FROM public.reviews
  WHERE target_id = v_target
    AND direction = v_direction
    AND status = 'visible'
    AND (v_direction <> 'client_to_master' OR order_id IS NOT NULL);

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
     WHERE direction = 'client_to_master' AND status = 'visible' AND order_id IS NOT NULL
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
  RAISE NOTICE '0254: рейтинг пересчитан у % специалистов', v_changed;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Админка «Подозрительные» (§4). Доступ — is_staff_session(), как у
--    admin_set_review_status. Действия над отзывом — admin_set_review_status.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_flagged_reviews()
 RETURNS TABLE(id uuid, created_at timestamp with time zone, status text, rating integer,
               text text, order_id uuid,
               author_id uuid, author_label text, author_created_at timestamp with time zone,
               author_orders_count integer, author_status text,
               target_id uuid, target_label text, flags text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT rv.id, rv.created_at, rv.status::text, rv.rating, rv.text, rv.order_id,
         rv.author_id,
         coalesce(nullif(btrim(concat_ws(' ', au.first_name, au.last_name)), ''), au.username),
         au.created_at,
         (SELECT count(*)::int FROM public.orders o WHERE o.client_id = rv.author_id),
         au.status::text,
         rv.target_id,
         coalesce(nullif(btrim(concat_ws(' ', tu.first_name, tu.last_name)), ''), tu.username),
         coalesce((SELECT array_agg(f.code ORDER BY f.code) FROM public.review_flags f
                    WHERE f.review_id = rv.id), ARRAY[]::text[])
    FROM public.reviews rv
    LEFT JOIN public.users au ON au.id = rv.author_id
    LEFT JOIN public.users tu ON tu.id = rv.target_id
   WHERE rv.status = 'pending'
      OR EXISTS (SELECT 1 FROM public.review_flags f WHERE f.review_id = rv.id)
   ORDER BY (rv.status = 'pending') DESC, rv.created_at DESC, rv.id DESC
   LIMIT 200;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_flagged_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_flagged_reviews() TO authenticated, service_role;

-- Балл подозрительности (в порядке убывания; показываются только score > 0):
--   1 × отзыв без задания
-- + 2 × отзыв от аккаунта младше 7 дней на момент отзыва
-- + 1 × отзыв от аккаунта без единого своего задания
-- + 3 × отзыв с общего устройства (notification_token_history)
-- + 2 × взаимный отзыв (специалист оставлял отзыв автору; ответная оценка
--       по тому же заданию не считается)
-- Доля пятёрок показывается, в балл не входит.
CREATE FUNCTION public.admin_list_suspicious_specialists(p_days integer DEFAULT 30)
 RETURNS TABLE(target_id uuid, target_label text, rating_avg numeric, rating_count integer,
               reviews_total integer, reviews_direct integer, reviews_pending integer,
               from_new_accounts integer, from_accounts_without_orders integer,
               shared_device integer, mutual integer, five_star_share numeric,
               last_review_at timestamp with time zone, score integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT rv.target_id, rv.rating, rv.status, rv.created_at,
           (rv.order_id IS NULL) AS is_direct,
           (au.created_at > rv.created_at - interval '7 days') AS is_new,
           NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.client_id = rv.author_id) AS no_orders,
           EXISTS (SELECT 1
                     FROM public.notification_token_history a
                     JOIN public.notification_token_history b ON b.device_token = a.device_token
                    WHERE a.user_id = rv.author_id AND b.user_id = rv.target_id) AS is_shared,
           -- Взаимные оценки по одному заданию — нормальный ход работы, не сигнал.
           EXISTS (SELECT 1 FROM public.reviews m
                    WHERE m.author_id = rv.target_id AND m.target_id = rv.author_id
                      AND (rv.order_id IS NULL OR m.order_id IS DISTINCT FROM rv.order_id)) AS is_mutual
      FROM public.reviews rv
      JOIN public.users au ON au.id = rv.author_id
     WHERE rv.direction = 'client_to_master'
       AND rv.created_at > now() - make_interval(days => v_days)
  ), s AS (
    SELECT r.target_id,
           count(*)::int AS total,
           count(*) FILTER (WHERE r.is_direct)::int AS direct,
           count(*) FILTER (WHERE r.status = 'pending')::int AS pending,
           count(*) FILTER (WHERE r.is_new)::int AS new_acc,
           count(*) FILTER (WHERE r.no_orders)::int AS no_orders,
           count(*) FILTER (WHERE r.is_shared)::int AS shared,
           count(*) FILTER (WHERE r.is_mutual)::int AS mutual,
           round((count(*) FILTER (WHERE r.rating = 5))::numeric / count(*), 2) AS five_share,
           max(r.created_at) AS last_at
      FROM r
     GROUP BY r.target_id
  )
  SELECT s.target_id,
         coalesce(nullif(btrim(concat_ws(' ', tu.first_name, tu.last_name)), ''), tu.username),
         mp.rating_overall_avg,
         mp.rating_overall_count,
         s.total, s.direct, s.pending, s.new_acc, s.no_orders, s.shared, s.mutual,
         s.five_share, s.last_at,
         (s.direct + 2 * s.new_acc + s.no_orders + 3 * s.shared + 2 * s.mutual)::int AS score
    FROM s
    LEFT JOIN public.users tu ON tu.id = s.target_id
    LEFT JOIN public.master_profiles mp ON mp.user_id = s.target_id
   WHERE (s.direct + 2 * s.new_acc + s.no_orders + 3 * s.shared + 2 * s.mutual) > 0
   ORDER BY 14 DESC, s.last_at DESC
   LIMIT 200;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_suspicious_specialists(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_suspicious_specialists(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Самопроверка: при расхождении — исключение и откат всей транзакции.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.review_flags'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notification_token_history'::regclass) THEN
    RAISE EXCEPTION '0254_check_rls';
  END IF;
  IF has_table_privilege('anon', 'public.review_flags', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_table_privilege('authenticated', 'public.review_flags', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_table_privilege('anon', 'public.notification_token_history', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_table_privilege('authenticated', 'public.notification_token_history', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') THEN
    RAISE EXCEPTION '0254_check_table_grants';
  END IF;
  IF has_function_privilege('anon', 'public.submit_direct_review(uuid,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.submit_direct_review(uuid,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_list_flagged_reviews()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_list_suspicious_specialists(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trg_notification_token_history()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trg_users_purge_token_history()', 'EXECUTE') THEN
    RAISE EXCEPTION '0254_check_function_grants';
  END IF;
  IF to_regclass('public.reviews_direct_author_target_key') IS NULL THEN
    RAISE EXCEPTION '0254_check_unique_index';
  END IF;
  IF (SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy
       WHERE polrelid = 'public.reviews'::regclass AND polname = 'reviews_insert_participant')
     NOT LIKE '((order_id IS NOT NULL) AND %''master_to_client''::review_direction) AND (orders.picked_master_id = reviews.author_id)%' THEN
    RAISE EXCEPTION '0254_check_insert_policy';
  END IF;
  IF (SELECT count(*) FROM cron.job
       WHERE jobname = 'nightly_prune_token_history' AND active
         AND schedule = '55 3 * * *'
         AND command LIKE '%notification_token_history%180 days%') <> 1 THEN
    RAISE EXCEPTION '0254_check_cron_job';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.users'::regclass
                  AND tgname = 'users_purge_token_history' AND tgenabled = 'O')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.notification_tokens'::regclass
                  AND tgname = 'notification_tokens_history' AND tgenabled = 'O') THEN
    RAISE EXCEPTION '0254_check_triggers';
  END IF;
  IF position('order_id IS NOT NULL' IN pg_get_functiondef('public.recalc_master_rating()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '0254_check_recalc_body';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.master_profiles mp
      LEFT JOIN (SELECT target_id, ROUND(AVG(rating)::numeric, 1)::numeric(2,1) AS a, COUNT(*)::int AS c
                   FROM public.reviews
                  WHERE direction = 'client_to_master' AND status = 'visible' AND order_id IS NOT NULL
                  GROUP BY target_id) s ON s.target_id = mp.user_id
     WHERE mp.rating_overall_avg IS DISTINCT FROM s.a
        OR mp.rating_overall_count IS DISTINCT FROM coalesce(s.c, 0)) THEN
    RAISE EXCEPTION '0254_check_ratings';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notification_tokens t
               JOIN public.users u ON u.id = t.user_id AND u.status <> 'deleted'
              WHERE NOT EXISTS (SELECT 1 FROM public.notification_token_history h
                                 WHERE h.device_token = t.device_token AND h.user_id = t.user_id))
     OR EXISTS (SELECT 1 FROM public.notification_token_history h
                  JOIN public.users u ON u.id = h.user_id AND u.status = 'deleted') THEN
    RAISE EXCEPTION '0254_check_token_history_backfill';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
