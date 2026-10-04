-- 0215: админка — пульт (очереди, графики), задания, отзывы, категории.
--
-- Контракт: docs/ADMIN_REDESIGN_2026-10.md §5. Только новое: существующие
-- функции не меняются, таблицы не меняются, данные не правятся.
--
-- Было: в админке нет раздела «Задания» (задание скрывается только из жалобы,
-- вернуть скрытое нельзя ни клиенту — reopen_order запрещает moderation:%, —
-- ни админу), нет списка отзывов, нет управления видимостью категорий, а
-- пульт собирает счётчики очередей несколькими запросами.
--
-- Стало (всё — public, SECURITY DEFINER, search_path public,pg_temp,
-- проверка public.is_admin_session() первой строкой, 'forbidden' 42501):
--   admin_attention()                         — счётчики очередей одним запросом;
--   admin_metrics_series(p_days)              — по дням (Europe/Moscow);
--   admin_list_orders(...)                    — список заданий с поиском;
--   admin_order_card(p_order_id)              — карточка задания;
--   admin_restore_order(p_order_id, p_reason) — вернуть скрытое модерацией;
--   admin_list_reviews(...)                   — список отзывов;
--   admin_set_review_status(...)              — скрыть/показать отзыв;
--   admin_list_categories()                   — категории со счётчиками;
--   admin_set_category_visible(...)           — скрыть/показать категорию.
--
-- Журнал admin_actions: новые действия restore_order, category_show,
-- category_hide и новый target_type 'category'. Почему 'category', а не
-- 'settings': admin_actions.target_id — uuid NOT NULL, а id категории —
-- text, так что id в target_id не влезает в любом случае (как у
-- set_order_limits — нулевой uuid, id категории — в details.l2_id). Отдельный
-- тип честнее для фильтра журнала и не даёт фронтенду принять нулевой uuid за
-- ссылку на настройки. Ограничение всё равно пересоздаётся ради action.
--
-- Откат: 0215_admin_console_rollback.sql.
-- Применять от postgres (не суперпользователя): psql -v ON_ERROR_STOP=1 -q.
-- Перед применением: pg_dump -n public -n xtrud_api -Fc > /opt/xtrud/backups/pre-0215-<ts>.dump

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0215_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_attention()') IS NOT NULL THEN
    RAISE EXCEPTION '0215_already_applied';
  END IF;
  -- Ограничения журнала — ровно живые на 2026-10-04 (после 0214).
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM 'dd0be808907fe83bded0e2ba6cfed459' THEN
    RAISE EXCEPTION '0215_admin_actions_action_check_changed';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_target_type_check')
     IS DISTINCT FROM '90f5cd6a055ed6238d3cdcc9a3bd205f' THEN
    RAISE EXCEPTION '0215_admin_actions_target_type_check_changed';
  END IF;
  IF to_regprocedure('public.notify_user(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL
     OR to_regclass('xtrud_private.recovery_requests') IS NULL
     OR to_regclass('public.master_verifications') IS NULL THEN
    RAISE EXCEPTION '0215_dependency_missing';
  END IF;
  -- Триггер пересчёта рейтинга должен сработать на смену статуса отзыва.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.reviews'::regclass
                    AND tgname = 'reviews_recalc_master_rating' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '0215_rating_trigger_missing';
  END IF;
END;
$$;

-- Журнал: живой список 2026-10-04 + новые значения.
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request',
  'restore_order', 'category_show', 'category_hide'
]::text[]));

ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_target_type_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_target_type_check CHECK (target_type = ANY (ARRAY[
  'user', 'order', 'order_response', 'review', 'report', 'storage_object', 'settings', 'promo_banner',
  'category'
]::text[]));

-- ---------------------------------------------------------------------------
-- 1. Пульт: что ждёт админа.
-- masters_pending — master_profiles.status = 'pending'. FACT (try_publish_master):
-- это профиль специалиста без единой категории, а не заявка на одобрение —
-- админу в нём делать нечего. Отдаётся по контракту, но в «Требует внимания»
-- его показывать не стоит (см. отчёт 0215).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN jsonb_build_object(
    'reports_open',          (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'verifications_pending', (SELECT count(*) FROM public.master_verifications WHERE status = 'pending'),
    'recovery_new',          (SELECT count(*) FROM xtrud_private.recovery_requests WHERE status = 'new'),
    'masters_pending',       (SELECT count(*) FROM public.master_profiles WHERE status = 'pending')
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Ряды по дням (московские сутки), все дни подряд, включая сегодня.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_metrics_series(p_days integer DEFAULT 30)
 RETURNS TABLE(day date, signups integer, orders integer, responses integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days int;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_from date;
  v_since timestamptz;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'bad_days' USING errcode = '22023';
  END IF;
  v_days := p_days;
  v_from := v_today - (v_days - 1);
  v_since := v_from::timestamp AT TIME ZONE 'Europe/Moscow';

  RETURN QUERY
  WITH d AS (
    SELECT g::date AS day FROM generate_series(v_from, v_today, interval '1 day') AS g
  ),
  s AS (
    SELECT (u.created_at AT TIME ZONE 'Europe/Moscow')::date AS day, count(*)::int AS n
      FROM public.users u WHERE u.created_at >= v_since GROUP BY 1
  ),
  o AS (
    SELECT (x.created_at AT TIME ZONE 'Europe/Moscow')::date AS day, count(*)::int AS n
      FROM public.orders x WHERE x.created_at >= v_since GROUP BY 1
  ),
  r AS (
    SELECT (x.created_at AT TIME ZONE 'Europe/Moscow')::date AS day, count(*)::int AS n
      FROM public.order_responses x WHERE x.created_at >= v_since GROUP BY 1
  )
  SELECT d.day, coalesce(s.n, 0), coalesce(o.n, 0), coalesce(r.n, 0)
    FROM d
    LEFT JOIN s ON s.day = d.day
    LEFT JOIN o ON o.day = d.day
    LEFT JOIN r ON r.day = d.day
   ORDER BY d.day;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Список заданий. Поиск: название (ILIKE, спецсимволы экранируются) или
-- номер клиента — от 4 цифр, сверяются последние 10 цифр номера.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_orders(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
 RETURNS TABLE(id uuid, title text, status text, created_at timestamptz, city text, category text,
               client_id uuid, client_label text, responses_count integer,
               picked_master_label text, cancel_reason text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like text;
  v_digits text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF v_search IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := right(regexp_replace(v_search, '\D', '', 'g'), 10);
    IF length(v_digits) < 4 THEN
      v_digits := NULL;
    END IF;
  END IF;

  RETURN QUERY
  SELECT o.id, o.title, o.status::text, o.created_at,
         coalesce(c.name, o.district),
         l2.name_ru,
         o.client_id,
         coalesce(nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), cu.username),
         o.responses_count,
         coalesce(nullif(btrim(concat_ws(' ', pm.first_name, pm.last_name)), ''), pm.username),
         o.cancel_reason
    FROM public.orders o
    LEFT JOIN public.cities c ON c.id = o.city_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = o.l2_id
    LEFT JOIN public.users cu ON cu.id = o.client_id
    LEFT JOIN public.users pm ON pm.id = o.picked_master_id
   WHERE (p_status IS NULL OR p_status = '' OR o.status::text = p_status)
     AND (v_search IS NULL
          OR o.title ILIKE v_like
          OR (v_digits IS NOT NULL
              AND right(regexp_replace(coalesce(cu.contact_phone, ''), '\D', '', 'g'), 10) LIKE '%' || v_digits || '%'))
   ORDER BY o.created_at DESC, o.id DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Карточка задания: само задание, отклики, отзывы.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_order_card(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order jsonb;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
           'id', o.id,
           'title', o.title,
           'description', o.description,
           'status', o.status::text,
           'created_at', o.created_at,
           'updated_at', o.updated_at,
           'city', c.name,
           'district', o.district,
           'category', l2.name_ru,
           'budget_kind', o.budget_kind::text,
           'budget_value', o.budget_value,
           'contact_mode', o.contact_mode::text,
           'photo_urls', to_jsonb(o.photo_urls),
           'preferred_date', o.preferred_date,
           'client_id', o.client_id,
           'client_label', coalesce(nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), cu.username),
           'client_phone', cu.contact_phone,
           'picked_master_id', o.picked_master_id,
           'picked_master_label', coalesce(nullif(btrim(concat_ws(' ', pm.first_name, pm.last_name)), ''), pm.username),
           'cancel_reason', o.cancel_reason,
           'responses_count', o.responses_count,
           -- Вернуть можно только то, что скрыл админ: признак — последнее
           -- событие журнала по заданию, а не текст причины (его клиент пишет
           -- сам; ревью xtrud-security 2026-10-04, F1).
           'restorable', coalesce(o.status = 'cancelled' AND (
              SELECT a.action FROM public.admin_actions a
               WHERE a.target_type = 'order' AND a.target_id = o.id
                 AND a.action IN ('hide_order', 'restore_order')
               ORDER BY a.performed_at DESC LIMIT 1) = 'hide_order', false))
    INTO v_order
    FROM public.orders o
    LEFT JOIN public.cities c ON c.id = o.city_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = o.l2_id
    LEFT JOIN public.users cu ON cu.id = o.client_id
    LEFT JOIN public.users pm ON pm.id = o.picked_master_id
   WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'order', v_order,
    'responses', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id,
               'master_id', r.master_id,
               'master_label', coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username),
               'status', r.status::text,
               'price_kind', r.price_kind::text,
               'price_value', r.price_value,
               'message', r.message,
               'created_at', r.created_at) ORDER BY r.created_at DESC)
        FROM public.order_responses r
        LEFT JOIN public.users u ON u.id = r.master_id
       WHERE r.order_id = p_order_id), '[]'::jsonb),
    'reviews', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', rv.id,
               'rating', rv.rating,
               'text', rv.text,
               'status', rv.status::text,
               'direction', rv.direction::text,
               'author_label', coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username),
               'created_at', rv.created_at) ORDER BY rv.created_at DESC)
        FROM public.reviews rv
        LEFT JOIN public.users u ON u.id = rv.author_id
       WHERE rv.order_id = p_order_id), '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Вернуть задание, скрытое модерацией (admin_hide_order ставит
-- status='cancelled', cancel_reason='moderation: …'). Возврат — как reopen_order
-- (0200): выбранный исполнитель снова обычный откликнувшийся, выбор снят;
-- срок публикации, если истёк, — 14 дней от сейчас (как DEFAULT orders.expires_at
-- и reopen_order). Лимит активных заданий клиента не проверяется — это решение
-- модератора, а не новая публикация. Заказчика с ограниченным аккаунтом
-- задание не возвращается (fail-closed). Строку в order_status_log пишет
-- триггер orders_log_status_change.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_restore_order(p_order_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_client_status public.user_status;
  v_now timestamptz := now();
  v_hide_id uuid;
  v_last_action text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;
  -- Скрыто именно админом: последнее событие журнала по заданию —
  -- hide_order. Префикс «moderation:» клиент может написать сам (F1),
  -- поэтому он лишь дополнительная проверка.
  SELECT a.id, a.action INTO v_hide_id, v_last_action
    FROM public.admin_actions a
   WHERE a.target_type = 'order' AND a.target_id = p_order_id
     AND a.action IN ('hide_order', 'restore_order')
   ORDER BY a.performed_at DESC
   LIMIT 1;
  IF v_order.status <> 'cancelled'
     OR v_last_action IS DISTINCT FROM 'hide_order'
     OR coalesce(v_order.cancel_reason, '') NOT LIKE 'moderation:%' THEN
    RAISE EXCEPTION 'order_not_restorable' USING errcode = 'P0001';
  END IF;

  SELECT u.status INTO v_client_status FROM public.users u WHERE u.id = v_order.client_id;
  IF v_client_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'client_not_active' USING errcode = 'P0001';
  END IF;

  UPDATE public.order_responses SET status = 'withdrawn', updated_at = v_now
   WHERE order_id = p_order_id AND status = 'accepted';

  UPDATE public.orders
     SET status = 'open',
         cancel_reason = NULL,
         cancelled_by = NULL,
         picked_master_id = NULL,
         picked_at = NULL,
         last_activity_at = v_now,
         expires_at = CASE WHEN v_order.expires_at <= v_now THEN v_now + interval '14 days'
                           ELSE v_order.expires_at END,
         updated_at = v_now
   WHERE id = p_order_id;

  PERFORM public.admin_log_action('restore_order', 'order', p_order_id, v_reason, NULL,
                                  jsonb_build_object('client_id', v_order.client_id,
                                                     'cancel_reason', v_order.cancel_reason),
                                  v_hide_id);

  PERFORM public.notify_user(
    v_order.client_id, 'Задание снова опубликовано',
    left(coalesce(v_order.title, ''), 120),
    jsonb_build_object('type', 'order_restored', 'order_id', p_order_id));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Список отзывов.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_reviews(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
 RETURNS TABLE(id uuid, created_at timestamptz, rating integer, text text, status text, direction text,
               author_id uuid, author_label text, target_id uuid, target_label text,
               order_id uuid, order_title text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT rv.id, rv.created_at, rv.rating, rv.text, rv.status::text, rv.direction::text,
         rv.author_id,
         coalesce(nullif(btrim(concat_ws(' ', au.first_name, au.last_name)), ''), au.username),
         rv.target_id,
         coalesce(nullif(btrim(concat_ws(' ', tu.first_name, tu.last_name)), ''), tu.username),
         rv.order_id,
         o.title
    FROM public.reviews rv
    LEFT JOIN public.users au ON au.id = rv.author_id
    LEFT JOIN public.users tu ON tu.id = rv.target_id
    LEFT JOIN public.orders o ON o.id = rv.order_id
   WHERE p_status IS NULL OR p_status = '' OR rv.status::text = p_status
   ORDER BY rv.created_at DESC, rv.id DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Скрыть / показать отзыв. Рейтинг адресата пересчитывает триггер
-- reviews_recalc_master_rating (AFTER UPDATE, считает только status='visible':
-- master_profiles.rating_overall_* или users.rating_as_client_*). Повтор того
-- же статуса — без изменений и без записи в журнал.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_set_review_status(p_review_id uuid, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old public.review_status;
  v_author uuid;
  v_target uuid;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('visible', 'hidden') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT rv.status, rv.author_id, rv.target_id INTO v_old, v_author, v_target
    FROM public.reviews rv WHERE rv.id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_not_found' USING errcode = 'P0002';
  END IF;
  IF v_old::text = p_status THEN
    RETURN;
  END IF;

  UPDATE public.reviews SET status = p_status::public.review_status WHERE id = p_review_id;

  PERFORM public.admin_log_action(
    CASE WHEN p_status = 'hidden' THEN 'hide' ELSE 'unhide' END,
    'review', p_review_id, v_reason, NULL,
    jsonb_build_object('from', v_old::text, 'to', p_status,
                       'author_id', v_author, 'target_id', v_target));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Категории: раздел, категория, флаги, открытые задания (по основной
-- категории orders.l2_id) и специалисты (master_categories, все статусы).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_categories()
 RETURNS TABLE(l1_id text, l1_name text, l2_id text, l2_name text, is_active boolean,
               is_visible boolean, sort_order integer, open_orders integer, masters integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT l1.id, l1.name_ru, l2.id, l2.name_ru, l2.is_active, l2.is_visible, l2.sort_order,
         coalesce(oc.n, 0), coalesce(mc.n, 0)
    FROM public.categories_l2 l2
    JOIN public.categories_l1 l1 ON l1.id = l2.l1_id
    LEFT JOIN (SELECT o.l2_id, count(*)::int AS n FROM public.orders o
                WHERE o.status = 'open' GROUP BY o.l2_id) oc ON oc.l2_id = l2.id
    LEFT JOIN (SELECT m.l2_id, count(DISTINCT m.master_id)::int AS n FROM public.master_categories m
                GROUP BY m.l2_id) mc ON mc.l2_id = l2.id
   ORDER BY l1.sort_order, l1.id, l2.sort_order, l2.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Скрыть / показать категорию (categories_l2.is_visible). Повтор того же
-- значения — без изменений и без записи в журнал.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_set_category_visible(p_l2_id text, p_visible boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_visible IS NULL THEN
    RAISE EXCEPTION 'bad_visible' USING errcode = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT c.is_visible INTO v_old FROM public.categories_l2 c WHERE c.id = p_l2_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002';
  END IF;
  IF v_old = p_visible THEN
    RETURN;
  END IF;

  UPDATE public.categories_l2 SET is_visible = p_visible WHERE id = p_l2_id;

  PERFORM public.admin_log_action(
    CASE WHEN p_visible THEN 'category_show' ELSE 'category_hide' END,
    'category', '00000000-0000-0000-0000-000000000000'::uuid, v_reason, NULL,
    jsonb_build_object('l2_id', p_l2_id, 'from', v_old, 'to', p_visible));
END;
$function$;

-- ---------------------------------------------------------------------------
-- Гранты: гость — нет; вошедший — да (проверка админа внутри); service_role — да.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_attention() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_metrics_series(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_orders(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_order_card(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_restore_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_reviews(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_review_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_categories() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_category_visible(text, boolean, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_attention() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_metrics_series(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_order_card(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_reviews(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_review_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_categories() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_category_visible(text, boolean, text) TO authenticated, service_role;

-- Проверки после изменений: гостю ничего, вошедшему — вызов, все — SECURITY
-- DEFINER с фиксированным search_path и проверкой админа в теле.
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.admin_attention()',
    'public.admin_metrics_series(integer)',
    'public.admin_list_orders(text,text,integer,integer)',
    'public.admin_order_card(uuid)',
    'public.admin_restore_order(uuid,text)',
    'public.admin_list_reviews(text,integer,integer)',
    'public.admin_set_review_status(uuid,text,text)',
    'public.admin_list_categories()',
    'public.admin_set_category_visible(text,boolean,text)'
  ]::regprocedure[]
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0215_anon_can_execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0215_authenticated_cannot_execute %', v_fn;
    END IF;
    IF NOT (SELECT p.prosecdef
                   AND p.proconfig @> ARRAY['search_path=public, pg_temp']
                   AND p.prosrc LIKE '%IF NOT public.is_admin_session() THEN%'
              FROM pg_proc p WHERE p.oid = v_fn) THEN
      RAISE EXCEPTION '0215_function_not_guarded %', v_fn;
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
