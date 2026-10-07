-- 0239: роль «управляющий» (№286, 2026-10-07).
--
-- Решение владельца и таблица прав — docs/STAFF_ROLES_2026-10.md (§2, §3):
-- «некоторые аккаунты сделаем управляющими: внутри админки их можно
-- назначать. Управляющий получает задания без категории, назначает
-- категории, блокирует и разблокирует — часть функций админа, не всё».
--
-- Было: одна роль users.is_admin, проверка is_admin_session() во всех admin_*.
--
-- Стало:
--   * users.staff_role text NULL CHECK (staff_role IN ('manager')).
--     is_admin не меняется и главнее staff_role.
--   * public.is_staff_session() — админ ИЛИ управляющий; не demo; active.
--   * public.my_staff_role() → 'admin' | 'manager' | NULL (для приложения и
--     веб-админки; то же условие «не demo, active»).
--   * На is_staff_session() переходит ТОЛЬКО проверка доступа функций из
--     колонки «Управляющий ✓» (§2). Ровно одна строка
--     «IF NOT public.is_admin_session() THEN» → «… is_staff_session() …»;
--     тело сверяется по md5 с живым (2026-10-07), права EXECUTE прежние
--     (CREATE OR REPLACE их сохраняет):
--       admin_list_uncategorized_orders, admin_set_order_category,
--       admin_create_category, admin_list_ai_category_suggestions,
--       admin_hide_order, admin_restore_order, admin_hide_order_shadow,
--       admin_unhide_order, admin_list_shadow_hidden_orders,
--       admin_list_reports, admin_resolve_report, admin_warn_user,
--       admin_list_categories, admin_set_review_status (решение по
--       жалобе на отзыв: скрыть/вернуть отзыв), admin_log_action (журнал: без этого
--       действия управляющего падали бы на записи в журнал; сам
--       admin_log_action в allowlist сервера не входит).
--   * С правкой сверх проверки доступа (тела ниже целиком):
--       admin_user_card   — управляющему phone и login_email = NULL (ПДн
--                           остаются у админа, §2);
--       admin_order_card  — управляющему client_phone = NULL; + ключ l2_id
--                           для всех (на нём проверка «без категории» в
--                           /v2/admin/ai/assist: живая карточка его не
--                           отдавала, помощник всегда отвечал 409);
--       admin_set_user_status — управляющий не меняет статус админа и
--                           другого управляющего ('cannot_sanction_staff');
--       admin_attention   — + uncategorized_open, shadow_hidden (счётчики
--                           экрана «Управление», §5); админские счётчики
--                           (паспорта, восстановление, анкеты, Instagram)
--                           управляющему = NULL.
--   * xtrud_private.notify_admins_uncategorized — получатели: админы и
--     управляющие (не demo, active). Уведомлений о жалобах в базе нет
--     (FACT 2026-10-07: ни одна функция/триггер на reports не шлёт push) —
--     новая рассылка этой миграцией НЕ вводится, вопрос вынесен владельцу.
--   * guard_user_privilege_columns — staff_role, как is_admin, меняет только
--     владелец базы (postgres, в т.ч. SECURITY DEFINER-функции ниже).
--     UPDATE-гранта на столбец у authenticated и так нет — это второй рубеж.
--   * public.admin_set_staff_role(p_user_id, p_role 'manager'|NULL, p_reason)
--     — только админ: назначает и снимает УПРАВЛЯЮЩИХ. Админа не выдаёт и не
--     снимает ('admin_managed_by_owner'): вход в админку — только пароль,
--     и утёкший пароль не должен позволять назначить себе запасных админов
--     и снять владельца (ревью xtrud-security 2026-10-07, I1). Права админа
--     по-прежнему меняет только владелец базы через psql. Себя не меняет.
--     Журнал: action = 'staff_role_set'.
--   * admin_log_action: EXECUTE у authenticated отозван (ревью, M1). Её
--     вызывают только SECURITY DEFINER-функции от postgres (32 шт., FACT
--     2026-10-07), прямой вызов позволял бы писать в журнал подделки.
--   * public.admin_list_staff() — только админ: id, имя, телефон, роль,
--     статус, is_demo, last_active_at.
--   * Не меняется (закрыто для управляющего по умолчанию): каталог (правка,
--     слияние, порядок, разделы, видимость), паспорта/Instagram/вход
--     (admin_list_verifications, admin_set_user_password, …), рассылки,
--     баннеры, настройки и флаги, лимиты, метрики, журнал, admin_list_users,
--     admin_list_orders, admin_list_masters, RLS-политики «admin»,
--     xtrud_private.shadow_hidden_order_ids, загрузки/подписи файлов сервера.
--
-- Откат: 0239_staff_manager_role_rollback.sql. Ограничение журнала остаётся
-- в редакции 0239 (журнал append-only); назначения через
-- admin_set_staff_role с ролью 'admin'/снятием админа не откатываются (это
-- данные; журнал хранит from/to).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Предусловия: живые редакции 2026-10-07.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0239_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'staff_role')
     OR to_regprocedure('public.is_staff_session()') IS NOT NULL
     OR to_regprocedure('public.my_staff_role()') IS NOT NULL
     OR to_regprocedure('public.admin_set_staff_role(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.admin_list_staff()') IS NOT NULL THEN
    RAISE EXCEPTION '0239_already_applied';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM '907efdf939024b3aab170589d760abd8' THEN
    RAISE EXCEPTION '0239_admin_actions_action_check_changed';
  END IF;
  IF md5(pg_get_functiondef('public.is_admin_session()'::regprocedure))
       IS DISTINCT FROM '0480d897f5217f0cfcbc13f5807e91b5'
     OR md5(pg_get_functiondef('public.admin_user_card(uuid)'::regprocedure))
       IS DISTINCT FROM '40daa89a599cbe171eeec2ebf2ce04eb'
     OR md5(pg_get_functiondef('public.admin_order_card(uuid)'::regprocedure))
       IS DISTINCT FROM '5d627331636021b54df99624a6000326'
     OR md5(pg_get_functiondef('public.admin_set_user_status(uuid,text,text,uuid)'::regprocedure))
       IS DISTINCT FROM '7db6a6a8b3d862d8fb1bb01105cf8f81'
     OR md5(pg_get_functiondef('public.admin_attention()'::regprocedure))
       IS DISTINCT FROM 'e0017fb0b1692aff6902e1e45ad7ae71'
     OR md5(pg_get_functiondef('xtrud_private.notify_admins_uncategorized(uuid)'::regprocedure))
       IS DISTINCT FROM '106014e5ee6578470891ab1bab7777e9'
     OR md5(pg_get_functiondef('public.guard_user_privilege_columns()'::regprocedure))
       IS DISTINCT FROM '0fa47e0ed233d92298533e762d973233' THEN
    RAISE EXCEPTION '0239_function_changed';
  END IF;
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
    IF md5(pg_get_functiondef(r.sig::regprocedure)) IS DISTINCT FROM r.sum THEN
      RAISE EXCEPTION '0239_function_changed: %', r.sig;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Роль, проверка сессии, роль текущего пользователя.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN staff_role text NULL
  CONSTRAINT users_staff_role_check CHECK (staff_role IN ('manager'));

COMMENT ON COLUMN public.users.staff_role IS
  'Роль сотрудника кроме админа (0239): NULL | manager. Меняет только admin_set_staff_role.';

CREATE FUNCTION public.is_staff_session()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = auth.uid()
       AND (u.is_admin OR u.staff_role = 'manager')
       AND NOT u.is_demo
       AND u.status = 'active'
  );
$function$;

CREATE FUNCTION public.my_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN u.is_admin THEN 'admin'
           WHEN u.staff_role = 'manager' THEN 'manager'
         END
    FROM public.users u
   WHERE u.id = auth.uid()
     AND NOT u.is_demo
     AND u.status = 'active';
$function$;

REVOKE ALL ON FUNCTION public.is_staff_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_session() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_staff_role() TO authenticated, service_role;

-- staff_role меняет только владелец базы (как is_admin, is_demo).
CREATE OR REPLACE FUNCTION public.guard_user_privilege_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Владелец базы обслуживает права вручную: выдача админа остаётся
  -- операцией через psql, у неё нет интерфейса и, значит, нет вектора атаки.
  -- admin_set_staff_role (0239) — SECURITY DEFINER от postgres, меняет
  -- только staff_role; is_admin по-прежнему лишь вручную.
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Изменение прав администратора запрещено'
      USING ERRCODE = '42501',
            DETAIL = 'users.is_admin is managed by the database owner only';
  END IF;

  IF NEW.staff_role IS DISTINCT FROM OLD.staff_role THEN
    RAISE EXCEPTION 'Изменение роли сотрудника запрещено'
      USING ERRCODE = '42501',
            DETAIL = 'users.staff_role is managed by admin_set_staff_role only';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'Изменение признака тестового аккаунта запрещено'
      USING ERRCODE = '42501',
            DETAIL = 'users.is_demo is managed by the database owner only';
  END IF;

  RETURN NEW;
END
$function$;

-- ---------------------------------------------------------------------------
-- 2. Перевод проверки доступа: ровно одна строка в каждой функции.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c_from constant text := 'IF NOT public.is_admin_session() THEN';
  c_to   constant text := 'IF NOT public.is_staff_session() THEN';
  r record;
  v_def text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.admin_list_uncategorized_orders(integer)'),
      ('public.admin_set_order_category(uuid,text,text)'),
      ('public.admin_create_category(text,text,text,text[])'),
      ('public.admin_list_ai_category_suggestions(integer)'),
      ('public.admin_hide_order(uuid,text,uuid)'),
      ('public.admin_restore_order(uuid,text)'),
      ('public.admin_hide_order_shadow(uuid,text)'),
      ('public.admin_unhide_order(uuid,text)'),
      ('public.admin_list_shadow_hidden_orders(integer)'),
      ('public.admin_list_reports(text,integer,integer)'),
      ('public.admin_resolve_report(uuid,text,text)'),
      ('public.admin_warn_user(uuid,text,uuid)'),
      ('public.admin_list_categories()'),
      ('public.admin_set_review_status(uuid,text,text)'),
      ('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)')
    ) AS t(sig)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF (length(v_def) - length(replace(v_def, c_from, ''))) / length(c_from) <> 1 THEN
      RAISE EXCEPTION '0239_guard_not_unique: %', r.sig;
    END IF;
    EXECUTE replace(v_def, c_from, c_to);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Карточки, статус, сводка — с правкой сверх проверки доступа.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_user_card(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card jsonb;
  v_admin boolean;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  -- Телефон и логин — персональные данные: только админу (0239, §2).
  v_admin := public.is_admin_session();

  SELECT jsonb_build_object(
           'user', jsonb_build_object(
             'id', u.id,
             'first_name', u.first_name,
             'last_name', u.last_name,
             'username', u.username,
             'phone', CASE WHEN v_admin THEN up.phone END,
             'login_email', CASE WHEN v_admin THEN au.email END,
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
  v_admin boolean;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  -- Телефон клиента — персональные данные: только админу (0239, §2).
  v_admin := public.is_admin_session();

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
           -- id категории (0239): на нём проверка «без категории» помощника
           -- /v2/admin/ai/assist и выбор в шторке каталога.
           'l2_id', o.l2_id,
           'budget_kind', o.budget_kind::text,
           'budget_value', o.budget_value,
           'contact_mode', o.contact_mode::text,
           'photo_urls', to_jsonb(o.photo_urls),
           'preferred_date', o.preferred_date,
           'client_id', o.client_id,
           'client_label', coalesce(nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), cu.username),
           'client_phone', CASE WHEN v_admin THEN cu.contact_phone END,
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
  v_staff_role text;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('active', 'suspended', 'banned') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT u.status::text, u.is_admin, u.staff_role INTO v_current, v_is_admin, v_staff_role
    FROM public.users u WHERE u.id = p_user_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  -- Управляющий не меняет статус админа и другого управляющего (в том числе
  -- свой): сотрудниками распоряжается только админ (0239, §2).
  IF (v_is_admin OR v_staff_role IS NOT NULL) AND NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'cannot_sanction_staff' USING errcode = '42501';
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
DECLARE
  v_admin boolean;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  v_admin := public.is_admin_session();

  RETURN jsonb_build_object(
    'reports_open',          (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    -- Экран «Управление» (0239, §5): открытые без категории и «красный флаг».
    'uncategorized_open',    (SELECT count(*) FROM public.orders
                               WHERE l2_id = 'uncategorized' AND status = 'open'),
    'shadow_hidden',         (SELECT count(*) FROM xtrud_private.order_shadow_hides
                               WHERE cleared_at IS NULL),
    -- Разделы только для админа: управляющему NULL.
    'verifications_pending', CASE WHEN v_admin THEN
                               (SELECT count(*) FROM public.master_verifications WHERE status = 'pending') END,
    'recovery_new',          CASE WHEN v_admin THEN
                               (SELECT count(*) FROM xtrud_private.recovery_requests WHERE status = 'new') END,
    'masters_pending',       CASE WHEN v_admin THEN
                               (SELECT count(*) FROM public.master_profiles WHERE status = 'pending') END,
    'instagram_pending',     CASE WHEN v_admin THEN
                               (SELECT count(*) FROM xtrud_private.instagram_requests WHERE status = 'pending') END
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. «Новое задание без категории» — админам и управляющим.
-- ---------------------------------------------------------------------------
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
  -- Получатели — админы и управляющие (0239), то же условие, что у
  -- is_staff_session().
  FOR v_admin IN
    SELECT u.id FROM public.users u
     WHERE (u.is_admin OR u.staff_role = 'manager')
       AND NOT u.is_demo AND u.status = 'active'
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

-- ---------------------------------------------------------------------------
-- 5. Команда: назначение ролей и список сотрудников (только админ).
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action = ANY (ARRAY[
    'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order',
    'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve',
    'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone',
    'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update',
    'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show',
    'category_hide', 'set_find_tiles', 'broadcast_push', 'category_open_responses',
    'set_require_login', 'instagram_approve', 'instagram_reject', 'experience_badge_grant',
    'experience_badge_revoke', 'set_composer_start', 'set_composer_form',
    'order_set_category', 'category_create', 'order_shadow_hide', 'order_shadow_unhide',
    'category_update', 'category_merge', 'section_rename', 'catalog_reorder',
    'staff_role_set'
  ]::text[]));

CREATE FUNCTION public.admin_set_staff_role(p_user_id uuid, p_role text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
  v_status text;
  v_is_admin boolean;
  v_staff text;
  v_is_demo boolean;
  v_from text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_role IS NOT NULL AND v_role <> 'manager' THEN
    RAISE EXCEPTION 'admin_managed_by_owner' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_self' USING errcode = '42501';
  END IF;

  SELECT u.status::text, u.is_admin, u.staff_role, u.is_demo
    INTO v_status, v_is_admin, v_staff, v_is_demo
    FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;
  -- Админа меняет только владелец базы (psql), см. шапку.
  IF v_is_admin THEN
    RAISE EXCEPTION 'admin_managed_by_owner' USING errcode = '42501';
  END IF;

  v_from := v_staff;
  IF v_from IS NOT DISTINCT FROM v_role THEN
    RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', v_role, 'changed', false);
  END IF;

  -- Назначить можно только живой обычный аккаунт; снять — любой.
  IF v_role IS NOT NULL AND (v_status <> 'active' OR v_is_demo) THEN
    RAISE EXCEPTION 'user_not_eligible' USING errcode = '22023';
  END IF;

  UPDATE public.users
     SET staff_role = v_role,
         updated_at = now()
   WHERE id = p_user_id;

  PERFORM public.admin_log_action(
    'staff_role_set', 'user', p_user_id, v_reason, NULL,
    jsonb_build_object('from', v_from, 'to', v_role));

  RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', v_role, 'changed', true);
END;
$function$;

CREATE FUNCTION public.admin_list_staff()
 RETURNS TABLE(id uuid, first_name text, last_name text, phone text, role text,
               status text, is_demo boolean, last_active_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.first_name, u.last_name, up.phone,
         CASE WHEN u.is_admin THEN 'admin' ELSE u.staff_role END,
         u.status::text, u.is_demo, u.last_active_at
    FROM public.users u
    LEFT JOIN public.users_private up ON up.user_id = u.id
   WHERE u.is_admin OR u.staff_role IS NOT NULL
   ORDER BY u.is_admin DESC, u.first_name NULLS LAST, u.last_name NULLS LAST, u.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, text, uuid, jsonb, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_set_staff_role(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_role(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Постпроверки.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proacl::text AS acl, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('is_staff_session', 'my_staff_role', 'admin_set_staff_role',
                         'admin_list_staff', 'admin_user_card', 'admin_order_card',
                         'admin_set_user_status', 'admin_attention',
                         'admin_list_uncategorized_orders', 'admin_set_order_category',
                         'admin_create_category', 'admin_list_ai_category_suggestions',
                         'admin_hide_order', 'admin_restore_order', 'admin_hide_order_shadow',
                         'admin_unhide_order', 'admin_list_shadow_hidden_orders',
                         'admin_list_reports', 'admin_resolve_report', 'admin_warn_user',
                         'admin_list_categories', 'admin_log_action',
                         'admin_set_review_status')
  LOOP
    IF NOT r.prosecdef
       OR r.acl IS DISTINCT FROM (CASE
            WHEN r.sig::text LIKE '%admin_log_action(%' THEN '{postgres=X/postgres,service_role=X/postgres}'
            ELSE '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
          END) THEN
      RAISE EXCEPTION '0239_acl_wrong: % %', r.sig, r.acl;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'admin\_%'
         AND p.prosrc LIKE '%is_staff_session()%') <> 19 THEN
    RAISE EXCEPTION '0239_staff_function_count_wrong';
  END IF;
  -- Закрытое для управляющего осталось на is_admin_session().
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('admin_merge_category', 'admin_update_category', 'admin_move_orders',
                                  'admin_reorder', 'admin_rename_section', 'admin_list_verifications',
                                  'admin_review_verification', 'admin_set_user_password',
                                  'admin_set_user_phone', 'admin_broadcast_push', 'admin_metrics',
                                  'admin_list_users', 'admin_list_actions', 'admin_set_require_login',
                                  'admin_list_category_orders', 'admin_set_category_visible',
                                  'admin_set_category_open_responses', 'admin_list_instagram_requests',
                                  'admin_review_instagram', 'admin_list_recovery_requests',
                                  'admin_resolve_recovery_request', 'admin_set_order_limits')
                AND p.prosrc LIKE '%is_staff_session%') THEN
    RAISE EXCEPTION '0239_admin_only_widened';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
