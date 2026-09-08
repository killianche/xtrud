-- 0177: роль и схема для нашего API (docs/BACKEND_REWRITE_PLAN.md, этап 0–1).
-- Пароль роли задаётся отдельно на сервере (ALTER ROLE ... PASSWORD), в Git
-- его нет.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xtrud_api') THEN
    CREATE ROLE xtrud_api LOGIN NOINHERIT;
  END IF;
END $$;
-- Может выполнять запросы от имени ролей API (SET LOCAL ROLE), как authenticator.
GRANT anon, authenticated TO xtrud_api;

CREATE SCHEMA IF NOT EXISTS xtrud_api AUTHORIZATION xtrud_api;
CREATE TABLE IF NOT EXISTS xtrud_api.refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON xtrud_api.refresh_tokens (user_id) WHERE revoked_at IS NULL;
ALTER TABLE xtrud_api.refresh_tokens OWNER TO xtrud_api;

-- Регистрация и вход: те же строки, что писал GoTrue.
GRANT USAGE ON SCHEMA auth TO xtrud_api;
GRANT SELECT, INSERT, UPDATE ON auth.users, auth.identities TO xtrud_api;
GRANT USAGE ON SCHEMA public TO xtrud_api;
GRANT SELECT, UPDATE ON public.users, public.users_private TO xtrud_api;

COMMIT;

-- Дополнение (2026-09-08, применено): триггер создания public.users при
-- регистрации должен обходить RLS независимо от роли, которая вставляет в
-- auth.users (GoTrue шёл от supabase_auth_admin, xtrud-api — от своей роли).
ALTER FUNCTION public.handle_new_auth_user() SECURITY DEFINER SET search_path = public, pg_temp;

-- FACT (2026-09-08): у anon нет SELECT на users/master_profiles, а
-- search_masters была SECURITY INVOKER — гость получал «permission denied»
-- и через PostgREST. Функция читает только публичные поля и сама фильтрует
-- скрытых/демо — делаем её DEFINER, а не открываем таблицы анониму.
ALTER FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text) SECURITY DEFINER;
-- 0177b: регистрация одной функцией от владельца postgres (обходит RLS как
-- прежний GoTrue), роли API — только EXECUTE.
CREATE OR REPLACE FUNCTION xtrud_api.register_account(
  p_email text, p_password_hash text, p_phone text, p_first_name text, p_last_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM public.users_private WHERE right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)) THEN
    RAISE EXCEPTION 'Этот номер уже зарегистрирован. Войдите или обратитесь в поддержку.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
  VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          p_email, p_password_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{"email_verified":true}'::jsonb, now(), now(), false, false);
  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());
  UPDATE public.users_private SET phone = p_phone, updated_at = now() WHERE user_id = v_id;
  UPDATE public.users SET first_name = p_first_name, last_name = p_last_name,
         onboarding_completed_at = now(), updated_at = now() WHERE id = v_id;
  RETURN v_id;
END;
$$;
ALTER FUNCTION xtrud_api.register_account(text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION xtrud_api.register_account(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xtrud_api.register_account(text, text, text, text, text) TO xtrud_api;
GRANT USAGE ON SCHEMA xtrud_api TO postgres;
-- 0177c: доступ API к учётным записям только через функции владельца базы —
-- прямых прав на auth.users у роли xtrud_api нет.
REVOKE SELECT, INSERT, UPDATE ON auth.users, auth.identities FROM xtrud_api;
REVOKE SELECT, UPDATE ON public.users, public.users_private FROM xtrud_api;

CREATE OR REPLACE FUNCTION xtrud_api.find_account(p_login text)
RETURNS TABLE(id uuid, email text, phone text, encrypted_password text, banned_until timestamptz, deleted_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT u.id, u.email::text, up.phone, u.encrypted_password::text, u.banned_until, u.deleted_at
    FROM auth.users u
    LEFT JOIN public.users_private up ON up.user_id = u.id
   WHERE (position('@' in p_login) > 0 AND lower(u.email) = lower(btrim(p_login)))
      OR (position('@' in p_login) = 0
          AND right(regexp_replace(coalesce(up.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(p_login, '\D', '', 'g'), 10)
          AND length(regexp_replace(p_login, '\D', '', 'g')) >= 10)
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION xtrud_api.account_by_id(p_id uuid)
RETURNS TABLE(id uuid, email text, phone text, encrypted_password text, banned_until timestamptz, deleted_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT u.id, u.email::text, up.phone, u.encrypted_password::text, u.banned_until, u.deleted_at
    FROM auth.users u LEFT JOIN public.users_private up ON up.user_id = u.id
   WHERE u.id = p_id;
$$;

CREATE OR REPLACE FUNCTION xtrud_api.touch_sign_in(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'auth', 'pg_temp'
AS $$ UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = p_id; $$;

CREATE OR REPLACE FUNCTION xtrud_api.set_password_hash(p_id uuid, p_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'auth', 'pg_temp'
AS $$ UPDATE auth.users SET encrypted_password = p_hash, updated_at = now() WHERE id = p_id; $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['find_account(text)', 'account_by_id(uuid)', 'touch_sign_in(uuid)', 'set_password_hash(uuid, text)'] LOOP
    EXECUTE format('ALTER FUNCTION xtrud_api.%s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION xtrud_api.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION xtrud_api.%s TO xtrud_api', f);
  END LOOP;
END $$;
-- 0177d: GoTrue ждёт пустые строки (не NULL) в служебных колонках токенов —
-- иначе его вход падает с «Database error querying schema». Заполняем как он.
CREATE OR REPLACE FUNCTION xtrud_api.register_account(
  p_email text, p_password_hash text, p_phone text, p_first_name text, p_last_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM public.users_private WHERE right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)) THEN
    RAISE EXCEPTION 'Этот номер уже зарегистрирован. Войдите или обратитесь в поддержку.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, email_change_confirm_status, phone_change, phone_change_token,
     reauthentication_token)
  VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          p_email, p_password_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{"email_verified":true}'::jsonb, now(), now(), false, false,
          '', '', '', '', '', 0, '', '', '');
  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());
  UPDATE public.users_private SET phone = p_phone, updated_at = now() WHERE user_id = v_id;
  UPDATE public.users SET first_name = p_first_name, last_name = p_last_name,
         onboarding_completed_at = now(), updated_at = now() WHERE id = v_id;
  RETURN v_id;
END;
$$;
-- 0177e: обмен refresh-токена GoTrue на сессию xtrud-api (переезд без
-- повторного входа). Токен GoTrue после обмена отзывается.
CREATE OR REPLACE FUNCTION xtrud_api.consume_gotrue_refresh(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'auth', 'pg_temp'
AS $$
DECLARE v_user uuid;
BEGIN
  UPDATE auth.refresh_tokens SET revoked = true, updated_at = now()
   WHERE token = p_token AND coalesce(revoked, false) = false
  RETURNING user_id INTO v_user;
  RETURN v_user;
END;
$$;
ALTER FUNCTION xtrud_api.consume_gotrue_refresh(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION xtrud_api.consume_gotrue_refresh(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xtrud_api.consume_gotrue_refresh(text) TO xtrud_api;
-- 0177f: статус аккаунта из public.users в ответах find_account/account_by_id —
-- бан админкой живёт там, а не в auth.users.banned_until.
DROP FUNCTION IF EXISTS xtrud_api.find_account(text);
CREATE FUNCTION xtrud_api.find_account(p_login text)
RETURNS TABLE(id uuid, email text, phone text, encrypted_password text, banned_until timestamptz, deleted_at timestamptz, user_status text)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT u.id, u.email::text, up.phone, u.encrypted_password::text, u.banned_until, u.deleted_at, pu.status::text
    FROM auth.users u
    LEFT JOIN public.users_private up ON up.user_id = u.id
    LEFT JOIN public.users pu ON pu.id = u.id
   WHERE (position('@' in p_login) > 0 AND lower(u.email) = lower(btrim(p_login)))
      OR (position('@' in p_login) = 0
          AND right(regexp_replace(coalesce(up.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(p_login, '\D', '', 'g'), 10)
          AND length(regexp_replace(p_login, '\D', '', 'g')) >= 10)
   ORDER BY u.created_at
   LIMIT 1;
$$;
DROP FUNCTION IF EXISTS xtrud_api.account_by_id(uuid);
CREATE FUNCTION xtrud_api.account_by_id(p_id uuid)
RETURNS TABLE(id uuid, email text, phone text, encrypted_password text, banned_until timestamptz, deleted_at timestamptz, user_status text)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT u.id, u.email::text, up.phone, u.encrypted_password::text, u.banned_until, u.deleted_at, pu.status::text
    FROM auth.users u
    LEFT JOIN public.users_private up ON up.user_id = u.id
    LEFT JOIN public.users pu ON pu.id = u.id
   WHERE u.id = p_id;
$$;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['find_account(text)', 'account_by_id(uuid)'] LOOP
    EXECUTE format('ALTER FUNCTION xtrud_api.%s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION xtrud_api.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION xtrud_api.%s TO xtrud_api', f);
  END LOOP;
END $$;
-- Один аккаунт на номер: уникальный индекс по последним 10 цифрам (дублей нет — проверено).
CREATE UNIQUE INDEX IF NOT EXISTS users_private_phone_key10_uniq
  ON public.users_private ((right(regexp_replace(phone, '\D', '', 'g'), 10)))
  WHERE phone IS NOT NULL;
-- 0177g (по отчёту безопасности 2026-09-08):
-- 1. Телефон специалиста — только вошедшим (раньше отдавался анониму).
CREATE OR REPLACE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pu.contact_phone
    FROM public.users pu
   WHERE auth.uid() IS NOT NULL
     AND pu.id = p_master_id AND pu.is_master = true AND pu.status = 'active';
$$;
-- 2. Таблица с телефонами: у анонима не должно быть и гранта (RLS — второй рубеж).
REVOKE SELECT ON public.users_private FROM anon;
-- 3. Бан/удаление в админке отзывает наши refresh-токены сразу.
CREATE OR REPLACE FUNCTION xtrud_api.revoke_tokens_on_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'xtrud_api', 'pg_temp'
AS $$
BEGIN
  IF NEW.status IN ('banned', 'deleted', 'suspended') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE xtrud_api.refresh_tokens SET revoked_at = now() WHERE user_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION xtrud_api.revoke_tokens_on_status() OWNER TO postgres;
DROP TRIGGER IF EXISTS users_revoke_tokens_on_status ON public.users;
CREATE TRIGGER users_revoke_tokens_on_status
  AFTER UPDATE OF status ON public.users
  FOR EACH ROW EXECUTE FUNCTION xtrud_api.revoke_tokens_on_status();
