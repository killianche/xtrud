-- Серверный контракт веб-админки (docs/ADMIN_PANEL.md §5, §6).
--
-- Панель — тонкий клиент без единого секрета: в браузер уходит только
-- публичный ключ, тот же, что уже лежит в опубликованном iOS-приложении.
-- Вся власть остаётся здесь, в базе.
--
-- Правила, общие для всех функций ниже:
--   * SECURITY DEFINER — иначе таблицы под RLS не прочитать;
--   * первая строка тела — проверка is_admin_session(). Признак админа
--     читается из базы, а не из JWT: отзыв прав должен действовать сразу;
--   * search_path прибит гвоздями, иначе SECURITY DEFINER можно увести
--     подставной схемой;
--   * каждое действие, меняющее данные, пишет в admin_actions —
--     на вопрос «кто это сделал» должен быть ответ;
--   * EXECUTE выдаётся роли authenticated, но не anon.
--
-- Чего здесь намеренно нет: выдачи и снятия признака админа. Второй админ
-- заводится только руками через SSH — это защита от «одна украденная сессия
-- размножила себе подобных».

BEGIN;

-- ── Сводка для дашборда ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN jsonb_build_object(
    'users_total',      (SELECT count(*) FROM public.users WHERE status <> 'deleted'),
    'users_suspended',  (SELECT count(*) FROM public.users WHERE status = 'suspended'),
    'users_banned',     (SELECT count(*) FROM public.users WHERE status = 'banned'),
    'masters_total',    (SELECT count(*) FROM public.users WHERE is_master AND status <> 'deleted'),
    'orders_open',      (SELECT count(*) FROM public.orders WHERE status = 'open'),
    'orders_total',     (SELECT count(*) FROM public.orders),
    'responses_total',  (SELECT count(*) FROM public.order_responses),
    'reports_open',     (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'signups_7d',       (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days')
  );
END;
$$;

-- ── Список людей с поиском ──────────────────────────────────────────────────
-- Поиск по имени, фамилии и номеру. Номер ищем по цифрам, поэтому «8 928…»,
-- «+7 928…» и «928…» находят одного и того же человека — то же правило, что
-- в resolve_login_email.
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  first_name    text,
  last_name     text,
  phone         text,
  status        text,
  is_master     boolean,
  is_admin      boolean,
  created_at    timestamptz,
  orders_count  bigint,
  responses_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_text   text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.first_name,
         u.last_name,
         up.phone,
         u.status::text,
         u.is_master,
         u.is_admin,
         u.created_at,
         (SELECT count(*) FROM public.orders o WHERE o.client_id = u.id),
         (SELECT count(*) FROM public.order_responses r WHERE r.master_id = u.id)
    FROM public.users u
    LEFT JOIN public.users_private up ON up.user_id = u.id
   WHERE v_text IS NULL
      OR (v_digits IS NOT NULL
          AND right(regexp_replace(coalesce(up.phone, ''), '\D', '', 'g'), 10)
              = right(v_digits, 10))
      OR u.first_name ILIKE '%' || v_text || '%'
      OR u.last_name  ILIKE '%' || v_text || '%'
   ORDER BY u.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- ── Карточка одного человека ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_user_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- ── Смена пароля владельцем ─────────────────────────────────────────────────
-- DECISION владельца 2026-09-03: восстановление доступа — вручную через
-- админку. Телефонные аккаунты письмом восстановить нельзя: адрес у них
-- синтетический (<цифры>@phone.xtrud.pro), ящика не существует.
--
-- Пароль хешируется тем же bcrypt, что использует GoTrue, иначе вход молча
-- перестанет работать. Сам пароль в журнал не пишется — только факт смены.
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_user_id      uuid,
  p_new_password text,
  p_reason       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short' USING errcode = '22023';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT true INTO v_exists FROM auth.users WHERE id = p_user_id;
  IF v_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;

  PERFORM public.admin_log_action(
    'set_password', 'user', p_user_id, p_reason, NULL,
    jsonb_build_object('by', 'admin_panel')
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Журнал действий ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_actions(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  performed_at timestamptz,
  admin_label  text,
  action       text,
  target_type  text,
  target_id    uuid,
  reason       text,
  details      jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id, a.performed_at, a.admin_label, a.action,
         a.target_type, a.target_id, a.reason, a.details
    FROM public.admin_actions a
   ORDER BY a.performed_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- ── Права ───────────────────────────────────────────────────────────────────
-- anon не получает ничего: панель работает только после входа.
REVOKE ALL ON FUNCTION public.admin_metrics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_card(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_actions(integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_actions(integer, integer) TO authenticated;

-- Самопроверка: обычный пользователь не должен пройти дальше первой строки.
DO $$
BEGIN
  IF to_regprocedure('public.admin_set_user_password(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'admin_set_user_password не создана';
  END IF;
  RAISE NOTICE 'RPC админки созданы, права выданы только authenticated.';
END
$$;

COMMIT;
