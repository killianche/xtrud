-- 0214: заявка «Забыли пароль?» — перезвоните мне.
--
-- DECISION владельца 2026-10-04 (очередь №193): SMS под авторизацию не
-- нужен. «При восстановлении пускай нам приходит заявка от клиента, мы с ним
-- созвонимся и восстановим ему пароль.» Раньше экран «Забыли пароль?» вёл
-- только в WhatsApp поддержки — человек должен был сам писать и объяснять.
--
-- Стало:
--   - xtrud_private.recovery_requests — заявки; доступа у ролей API нет;
--   - xtrud_private.create_recovery_request(phone) — зовёт только xtrud-api
--     (POST /v2/auth/recovery-request, без входа). Аккаунт ищется так же, как
--     при входе (последние 10 цифр, find_account). В заявку пишется номер
--     АККАУНТА, а не введённый: перезванивают на номер владельца, поэтому
--     чужой номер в форме ничего не даёт. Одна открытая заявка на аккаунт —
--     повтор не плодит строки и не будит админов ещё раз;
--   - каждому активному админу — уведомление и push (notify_user);
--   - public.admin_list_recovery_requests / admin_resolve_recovery_request —
--     раздел «Восстановление» в админке. Пароль задаётся как прежде, в
--     карточке человека (admin_set_user_password);
--   - admin_set_user_password теперь закрывает все прежние сессии человека:
--     восстановление по звонку — главный путь, и сессии угонщика после него
--     жить не должны (ревью xtrud-security 2026-10-04, M3).
--
-- Защита от спама (ревью M1, M2): больше 20 заявок за час — заявки
-- создаются без push (админы увидят их в админке); заявка, отклонённая
-- меньше суток назад, повторно не создаётся. В push — имя и последние 4
-- цифры номера, полный номер — в админке (L1).
--
-- Что ответ раскрывает: есть ли аккаунт с номером — это и так видно по входу
-- (account_not_found) и регистрации (409). Статус бана — нет: blocked и
-- deleted отвечают одним кодом.
--
-- Откат: 0214_recovery_requests_rollback.sql.
-- Применять от postgres (не суперпользователя).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0214_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.recovery_requests') IS NOT NULL THEN
    RAISE EXCEPTION '0214_already_applied';
  END IF;
  -- admin_set_user_password переписывается от живого тела 2026-10-04.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'admin_actions_action_check')
     NOT LIKE '%promo_banner_delete%' OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
     WHERE conname = 'admin_actions_action_check') LIKE '%recovery%' THEN
    RAISE EXCEPTION '0214_admin_actions_check_changed';
  END IF;
  IF md5(pg_get_functiondef('public.admin_set_user_password'::regproc))
     <> 'bc06582854d0998152506acfa6c9cd1e' THEN
    RAISE EXCEPTION '0214_admin_set_user_password_changed';
  END IF;
  IF to_regprocedure('public.notify_user(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('xtrud_api.find_account(text)') IS NULL
     OR to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL THEN
    RAISE EXCEPTION '0214_dependency_missing';
  END IF;
END;
$$;

-- Журнал админа принимает только известные действия — добавляем закрытие
-- заявки (список — живой на 2026-10-04 + одно значение).
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete',
  'resolve_recovery_request'
]::text[]));

CREATE TABLE xtrud_private.recovery_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Номер аккаунта на момент заявки — на него и перезванивают.
  phone       text        NOT NULL CHECK (length(phone) BETWEEN 10 AND 20),
  status      text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done', 'rejected')),
  note        text        CHECK (note IS NULL OR length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz,
  handled_by  uuid        REFERENCES auth.users (id) ON DELETE SET NULL
);
-- Одна открытая заявка на человека.
CREATE UNIQUE INDEX recovery_requests_one_open
  ON xtrud_private.recovery_requests (user_id) WHERE status = 'new';
CREATE INDEX recovery_requests_status_created
  ON xtrud_private.recovery_requests (status, created_at DESC);
REVOKE ALL ON xtrud_private.recovery_requests FROM PUBLIC, anon, authenticated, service_role;
-- RLS без политик: случайный грант в будущем доступа не откроет (L2).
ALTER TABLE xtrud_private.recovery_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Заявка от человека (через xtrud-api, без входа).
-- Ответ: created | exists | not_found | blocked.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.create_recovery_request(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_acc record;
  v_id uuid;
  v_name text;
  v_admin uuid;
BEGIN
  IF p_phone IS NULL OR length(regexp_replace(p_phone, '\D', '', 'g')) < 10 THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO v_acc FROM xtrud_api.find_account(p_phone);
  IF NOT FOUND OR v_acc.phone IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF v_acc.deleted_at IS NOT NULL
     OR v_acc.user_status IN ('banned', 'deleted')
     OR (v_acc.banned_until IS NOT NULL AND v_acc.banned_until > now()) THEN
    RETURN 'blocked';
  END IF;

  -- Отклонили меньше суток назад — повтор не будит админов снова (M2).
  IF EXISTS (SELECT 1 FROM xtrud_private.recovery_requests r
              WHERE r.user_id = v_acc.id AND r.status = 'rejected'
                AND r.handled_at > now() - interval '24 hours') THEN
    RETURN 'exists';
  END IF;

  INSERT INTO xtrud_private.recovery_requests (user_id, phone)
  VALUES (v_acc.id, v_acc.phone)
  ON CONFLICT (user_id) WHERE status = 'new' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN 'exists';
  END IF;

  SELECT nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
    INTO v_name
    FROM public.users u WHERE u.id = v_acc.id;

  -- Волна заявок (больше 20 за час) — без push, только в админке (M1).
  IF (SELECT count(*) FROM xtrud_private.recovery_requests r
       WHERE r.created_at > now() - interval '1 hour') > 20 THEN
    RETURN 'created';
  END IF;

  -- Админам — в «Уведомления» и push на телефон. Полный номер — в админке.
  FOR v_admin IN
    SELECT u.id FROM public.users u
     WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active'
  LOOP
    PERFORM public.notify_user(
      v_admin,
      'Заявка: восстановить пароль',
      coalesce(v_name || ' · ', '') || 'номер …' || right(v_acc.phone, 4) || ' — откройте админку',
      jsonb_build_object('type', 'system', 'kind', 'recovery_request', 'request_id', v_id)
    );
  END LOOP;

  RETURN 'created';
END;
$function$;

REVOKE ALL ON FUNCTION xtrud_private.create_recovery_request(text) FROM PUBLIC, anon, authenticated, service_role;
-- Схема xtrud_api принадлежит роли API, и postgres создавать в ней не может
-- (функции 0177 создавались суперпользователем). Поэтому функция — в
-- xtrud_private, а роли API — USAGE на схему и EXECUTE только на неё. USAGE
-- сам по себе прав не даёт: у anon и authenticated он на эту схему уже есть.
GRANT USAGE ON SCHEMA xtrud_private TO xtrud_api;
GRANT EXECUTE ON FUNCTION xtrud_private.create_recovery_request(text) TO xtrud_api;

-- ---------------------------------------------------------------------------
-- Админка: список и закрытие заявок.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_list_recovery_requests(
  p_status text DEFAULT 'new',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
 RETURNS TABLE(id uuid, created_at timestamptz, status text, phone text, user_id uuid,
               user_label text, note text, handled_at timestamptz)
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
  SELECT r.id, r.created_at, r.status, r.phone, r.user_id,
         (SELECT nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
            FROM public.users u WHERE u.id = r.user_id),
         r.note, r.handled_at
    FROM xtrud_private.recovery_requests r
   WHERE p_status IS NULL OR r.status = p_status
   ORDER BY (r.status = 'new') DESC, r.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$;

CREATE FUNCTION public.admin_resolve_recovery_request(p_id uuid, p_status text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_status NOT IN ('done', 'rejected') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;

  UPDATE xtrud_private.recovery_requests r
     SET status = p_status,
         note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
         handled_at = now(),
         handled_by = auth.uid()
   WHERE r.id = p_id AND r.status = 'new'
   RETURNING r.user_id INTO v_user;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'request_not_open' USING errcode = 'P0002';
  END IF;

  PERFORM public.admin_log_action(
    'resolve_recovery_request', 'user', v_user,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), p_status), NULL,
    jsonb_build_object('request_id', p_id, 'status', p_status)
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_recovery_requests(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_recovery_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_recovery_requests(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_recovery_request(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Временный пароль из админки закрывает прежние сессии (M3). Живое тело
-- 2026-10-04 + отзыв refresh-токенов (у postgres есть UPDATE на таблицу).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_password(p_user_id uuid, p_new_password text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
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

  -- Все прежние входы — вон: пароль задают, когда доступ потерян.
  UPDATE xtrud_api.refresh_tokens
     SET revoked_at = now()
   WHERE user_id = p_user_id AND revoked_at IS NULL;

  PERFORM public.admin_log_action(
    'set_password', 'user', p_user_id, p_reason, NULL,
    jsonb_build_object('by', 'admin_panel', 'sessions_revoked', true)
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Проверки после изменений.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'xtrud_private.recovery_requests', 'SELECT')
     OR has_table_privilege('anon', 'xtrud_private.recovery_requests', 'SELECT')
     OR has_function_privilege('anon', 'xtrud_private.create_recovery_request(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.create_recovery_request(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_list_recovery_requests(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_resolve_recovery_request(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0214_grants_too_wide';
  END IF;
  IF NOT has_function_privilege('xtrud_api', 'xtrud_private.create_recovery_request(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0214_api_cannot_call';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
