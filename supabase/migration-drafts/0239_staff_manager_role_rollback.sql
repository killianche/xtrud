-- Откат 0239 (роль «управляющий», №286).
--
-- Порядок: СНАЧАЛА вернуть сервер (xtrud-api до 0239: assist.ts зовёт
-- is_admin_session), затем этот файл — иначе /v2/admin/ai/assist упадёт на
-- отсутствующей is_staff_session(). Веб-админка и приложение, которые зовут
-- my_staff_role / admin_list_staff / admin_set_staff_role, получат 404/42883
-- — их тоже вернуть раньше базы.
--
-- Что делает:
--   * 15 функций с переводом проверки — обратная замена
--     is_staff_session → is_admin_session; результат сверяется по md5 с
--     живым телом до 0239 (то есть откат точный);
--   * admin_user_card, admin_order_card, admin_set_user_status,
--     admin_attention, xtrud_private.notify_admins_uncategorized,
--     guard_user_privilege_columns — тела до 0239 (живые 2026-10-07)
--     целиком; предусловие — md5 редакции 0239 (снято на репетиции);
--   * DROP admin_set_staff_role, admin_list_staff, my_staff_role,
--     is_staff_session; DROP COLUMN users.staff_role (назначения
--     управляющих теряются — в этом и смысл отката; журнал admin_actions
--     хранит, кто кому что назначал).
-- Не откатывается: ограничение admin_actions_action_check остаётся в
-- редакции 0239 (в журнале могут быть строки staff_role_set, журнал
-- append-only); изменения is_admin, сделанные через admin_set_staff_role,
-- — это данные, их возвращают вручную по журналу.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0239_rollback_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.is_staff_session()') IS NULL THEN
    RAISE EXCEPTION '0239_not_applied';
  END IF;
  IF md5(pg_get_functiondef('public.admin_user_card(uuid)'::regprocedure))
       IS DISTINCT FROM '370e6670b99f31e72e6841b54d1d7232'
     OR md5(pg_get_functiondef('public.admin_order_card(uuid)'::regprocedure))
       IS DISTINCT FROM '8033cf96356daa5c3a5a2c9a42b010a8'
     OR md5(pg_get_functiondef('public.admin_set_user_status(uuid,text,text,uuid)'::regprocedure))
       IS DISTINCT FROM '74a53f3b0cd1062f7fffe64ede3ecea2'
     OR md5(pg_get_functiondef('public.admin_attention()'::regprocedure))
       IS DISTINCT FROM '9aa18f7397f429168106f55be5fb709e'
     OR md5(pg_get_functiondef('xtrud_private.notify_admins_uncategorized(uuid)'::regprocedure))
       IS DISTINCT FROM '7aa706e377b3ea67a8bdc620d14e3cdb'
     OR md5(pg_get_functiondef('public.guard_user_privilege_columns()'::regprocedure))
       IS DISTINCT FROM '52a3a6177976b82bb8997475e006666f' THEN
    RAISE EXCEPTION '0239_rollback_function_changed_after_0239';
  END IF;
END $$;

-- 1. Обратная замена проверки доступа (точность — по md5 тела до 0239).
DO $$
DECLARE
  c_from constant text := 'IF NOT public.is_staff_session() THEN';
  c_to   constant text := 'IF NOT public.is_admin_session() THEN';
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.admin_list_uncategorized_orders(integer)',              'dbec47fd00aedee001828c2c37b8d858'),
      ('public.admin_set_order_category(uuid,text,text)',              '087bb7e5ee8180c8f6d139842696c122'),
      ('public.admin_create_category(text,text,text,text[])',          '0e9632a183cab75ec30ef5362293377e'),
      ('public.admin_list_ai_category_suggestions(integer)',           '0973ae2ce60adebe3c40dd989d754e49'),
      ('public.admin_hide_order(uuid,text,uuid)',                      '5daa6c2dd38aac06dd6484e30fa86161'),
      ('public.admin_restore_order(uuid,text)',                        '418454ca28cec7c91e1e780e75832a2a'),
      ('public.admin_hide_order_shadow(uuid,text)',                    '70dc5e12e6eaa9ff08e422a3db710a4e'),
      ('public.admin_unhide_order(uuid,text)',                         '566933e3e8b2bbeab6120f0074a4926b'),
      ('public.admin_list_shadow_hidden_orders(integer)',              '67c9595ee7ae49bb78ca8cbacef21f33'),
      ('public.admin_list_reports(text,integer,integer)',              '09e52f46b0d8c15dc98b296f935caabc'),
      ('public.admin_resolve_report(uuid,text,text)',                  '1045d124784cbf41e45e0787246a0e87'),
      ('public.admin_warn_user(uuid,text,uuid)',                       'd3e2f37bfa14ad2a1c4997639e583a08'),
      ('public.admin_list_categories()',                               'a8207452aff39c59f89685199e3500ed'),
      ('public.admin_set_review_status(uuid,text,text)',               '933fe47ee7943666309fcd870ee0fbe5'),
      ('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)', 'e56e354ac146b3eb9d211231f55ce546')
    ) AS t(sig, sum)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    v_new := replace(v_def, c_from, c_to);
    IF md5(v_new) IS DISTINCT FROM r.sum THEN
      RAISE EXCEPTION '0239_rollback_body_mismatch: %', r.sig;
    END IF;
    EXECUTE v_new;
  END LOOP;
END $$;

-- 2. Тела до 0239 (живые 2026-10-07).
CREATE OR REPLACE FUNCTION public.admin_user_card(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card jsonb;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
           'user', jsonb_build_object(
             'id', u.id,
             'first_name', u.first_name,
             'last_name', u.last_name,
             'username', u.username,
             'phone', up.phone,
             'login_email', au.email,
             'status', u.status::text,
             'is_master', u.is_master,
             'is_admin', u.is_admin,
             'created_at', u.created_at,
             'last_sign_in_at', au.last_sign_in_at,
             'city_id', u.city_id,
             'district', u.district
           ),
           'orders', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', o.id, 'title', o.title,
                      'status', o.status::text, 'created_at', o.created_at)
                    ORDER BY o.created_at DESC)
               FROM (SELECT * FROM public.orders WHERE client_id = u.id
                     ORDER BY created_at DESC LIMIT 20) o
           ), '[]'::jsonb),
           'responses', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', r.id, 'order_id', r.order_id,
                      'status', r.status::text, 'created_at', r.created_at)
                    ORDER BY r.created_at DESC)
               FROM (SELECT * FROM public.order_responses WHERE master_id = u.id
                     ORDER BY created_at DESC LIMIT 20) r
           ), '[]'::jsonb),
           'reviews', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', rv.id, 'rating', rv.rating,
                      'status', rv.status::text, 'created_at', rv.created_at)
                    ORDER BY rv.created_at DESC)
               FROM (SELECT * FROM public.reviews WHERE target_id = u.id
                     ORDER BY created_at DESC LIMIT 20) rv
           ), '[]'::jsonb)
         )
    INTO v_card
    FROM public.users u
    LEFT JOIN public.users_private up ON up.user_id = u.id
    LEFT JOIN auth.users au ON au.id = u.id
   WHERE u.id = p_user_id;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  RETURN v_card;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_order_card(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text, p_report_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current text;
  v_is_admin boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('active', 'suspended', 'banned') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT u.status::text, u.is_admin INTO v_current, v_is_admin
    FROM public.users u WHERE u.id = p_user_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  -- Заблокированный администратор перестаёт быть модератором (см.
  -- is_admin_session), то есть панель закрылась бы сама за собой.
  IF v_is_admin AND p_status <> 'active' THEN
    RAISE EXCEPTION 'cannot_sanction_admin' USING errcode = '42501';
  END IF;

  -- Удалённый аккаунт не воскрешаем: его данные уже обезличены.
  IF v_current = 'deleted' THEN
    RAISE EXCEPTION 'user_deleted' USING errcode = '22023';
  END IF;

  UPDATE public.users
     SET status = p_status::public.user_status,
         updated_at = now()
   WHERE id = p_user_id;

  PERFORM public.admin_log_action(
    CASE p_status
      WHEN 'suspended' THEN 'suspend'
      WHEN 'banned'    THEN 'ban'
      ELSE 'unban'
    END,
    'user', p_user_id, btrim(p_reason), p_report_id,
    jsonb_build_object('from', v_current, 'to', p_status)
  );

  RETURN jsonb_build_object('ok', true, 'from', v_current, 'to', p_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    'masters_pending',       (SELECT count(*) FROM public.master_profiles WHERE status = 'pending'),
    'instagram_pending',     (SELECT count(*) FROM xtrud_private.instagram_requests WHERE status = 'pending')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION xtrud_private.notify_admins_uncategorized(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid;
  v_title text;
BEGIN
  SELECT o.title INTO v_title FROM public.orders o
   WHERE o.id = p_order_id AND o.status = 'open' AND o.l2_id = 'uncategorized';
  IF NOT FOUND OR xtrud_private.order_is_shadow_hidden(p_order_id) THEN
    RETURN false;
  END IF;
  -- Волна (больше 20 событий за час) — без push, только в админке:
  -- лимиты публикации ограничивают одного человека, а не всех.
  IF (SELECT count(*) FROM xtrud_private.order_uncategorized_events e
       WHERE e.admin_notified_at > now() - interval '1 hour') > 20 THEN
    RETURN false;
  END IF;
  FOR v_admin IN
    SELECT u.id FROM public.users u
     WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active'
  LOOP
    BEGIN
      -- Без ключа order_id: он включил бы задание в счётчики «моих
      -- заданий» админа (use-notifications.ts считает строки с order_id).
      PERFORM public.notify_user(
        v_admin,
        'Новое задание без категории',
        left(v_title, 80) || ' — откройте админку',
        jsonb_build_object('type', 'system', 'kind', 'uncategorized_order',
                           'uncategorized_order_id', p_order_id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'uncategorized_order push %: %', p_order_id, SQLERRM;
    END;
  END LOOP;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_user_privilege_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Владелец базы обслуживает права вручную: выдача админа остаётся
  -- операцией через psql, у неё нет интерфейса и, значит, нет вектора атаки.
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Изменение прав администратора запрещено'
      USING ERRCODE = '42501',
            DETAIL = 'users.is_admin is managed by the database owner only';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'Изменение признака тестового аккаунта запрещено'
      USING ERRCODE = '42501',
            DETAIL = 'users.is_demo is managed by the database owner only';
  END IF;

  RETURN NEW;
END
$function$;

-- 3. Новые функции и столбец.
GRANT EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, text, uuid, jsonb, uuid) TO authenticated;
DROP FUNCTION public.admin_set_staff_role(uuid, text, text);
DROP FUNCTION public.admin_list_staff();
DROP FUNCTION public.my_staff_role();
DROP FUNCTION public.is_staff_session();
ALTER TABLE public.users DROP COLUMN staff_role;

-- Постпроверка: все затронутые функции — ровно редакции до 0239.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.admin_user_card(uuid)',                                  '40daa89a599cbe171eeec2ebf2ce04eb'),
      ('public.admin_order_card(uuid)',                                 '5d627331636021b54df99624a6000326'),
      ('public.admin_set_user_status(uuid,text,text,uuid)',             '7db6a6a8b3d862d8fb1bb01105cf8f81'),
      ('public.admin_attention()',                                      'e0017fb0b1692aff6902e1e45ad7ae71'),
      ('xtrud_private.notify_admins_uncategorized(uuid)',               '106014e5ee6578470891ab1bab7777e9'),
      ('public.guard_user_privilege_columns()',                         '0fa47e0ed233d92298533e762d973233')
    ) AS t(sig, sum)
  LOOP
    IF md5(pg_get_functiondef(r.sig::regprocedure)) IS DISTINCT FROM r.sum THEN
      RAISE EXCEPTION '0239_rollback_postcheck: %', r.sig;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE prosrc LIKE '%is_staff_session%'
                                      OR prosrc LIKE '%staff_role%') THEN
    RAISE EXCEPTION '0239_rollback_leftover_reference';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
