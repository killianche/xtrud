-- 0220: смена номера только после подтверждения звонком (№220).
--
-- Найдено 2026-10-04: users_private.phone — это номер входа
-- (xtrud_api.find_account ищет по нему), а роль authenticated могла менять
-- его своим UPDATE без всякой проверки («Сменить телефон» в приложении).
-- Так можно было занять чужой номер: настоящий владелец уже не
-- зарегистрируется. Синтетический адрес входа при этом оставался со старым
-- номером.
--
-- Было: authenticated — INSERT/UPDATE/DELETE на public.users_private (свою
--   строку, RLS); приложение писало phone напрямую.
-- Стало: прямой записи нет (её делают только функции владельца базы:
--   register_account, delete_my_account, admin_set_user_phone);
--   xtrud_private.change_account_phone(user, phone) вызывает сервер
--   (/v2/auth/phone) после подтверждения нового номера звонком: номер,
--   адрес входа (как у register_account — все цифры @phone.xtrud.pro),
--   отзыв прежних входов. Настоящая (не синтетическая) почта не меняется.
-- Плюс (ревью xtrud-security 2026-10-04):
--   - xtrud_private.notify_security_event(user, kind) — push владельцу
--     «Пароль изменён / Номер изменён — если это не вы, напишите в
--     поддержку» с заранее заданным текстом (сервер не шлёт произвольный);
--   - два аккаунта, у которых синтетический адрес входа остался от прежнего
--     номера (следы прямого UPDATE), приводятся к текущему номеру — иначе
--     настоящий владелец того номера не мог зарегистрироваться.
--
-- Откат: 0220_change_phone_verified_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0220_must_run_as_postgres';
  END IF;
  IF to_regprocedure('xtrud_private.change_account_phone(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION '0220_already_applied';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.users_private', 'UPDATE') THEN
    RAISE EXCEPTION '0220_unexpected_grants';
  END IF;
  IF NOT has_schema_privilege('xtrud_api', 'xtrud_private', 'USAGE') THEN
    RAISE EXCEPTION '0220_needs_0214';
  END IF;
END;
$$;

-- 1. Прямой записи в users_private у ролей API больше нет.
REVOKE INSERT, UPDATE, DELETE ON public.users_private FROM authenticated, anon;

-- 2. Смена номера — после подтверждения на сервере.
CREATE FUNCTION xtrud_private.change_account_phone(p_user_id uuid, p_phone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'xtrud_api', 'pg_temp'
AS $function$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_rows int;
BEGIN
  -- Мобильный номер России: +79XXXXXXXXX (сервер проверил то же).
  IF v_digits !~ '^79\d{9}$' THEN
    RAISE EXCEPTION 'phone_invalid' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users_private
     WHERE user_id <> p_user_id
       AND right(regexp_replace(phone, '\D', '', 'g'), 10) = right(v_digits, 10)
  ) OR EXISTS (
    SELECT 1 FROM auth.users
     WHERE id <> p_user_id AND lower(email) = v_digits || '@phone.xtrud.pro'
  ) THEN
    RAISE EXCEPTION 'phone_taken' USING errcode = '23505';
  END IF;

  UPDATE public.users_private SET phone = '+' || v_digits, updated_at = now()
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'user_private_missing' USING errcode = 'P0002';
  END IF;
  -- Синтетический адрес входа — за номером; настоящую почту не трогаем.
  UPDATE auth.users SET email = v_digits || '@phone.xtrud.pro', updated_at = now()
   WHERE id = p_user_id AND (email IS NULL OR lower(email) LIKE '%@phone.xtrud.pro');
  -- Прежние входы отзываются; текущему устройству сервер выдаёт новый.
  UPDATE xtrud_api.refresh_tokens SET revoked_at = now()
   WHERE user_id = p_user_id AND revoked_at IS NULL;
END;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.change_account_phone(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION xtrud_private.change_account_phone(uuid, text) TO xtrud_api;

-- 3. Уведомление владельцу о смене пароля или номера (тексты — здесь).
CREATE FUNCTION xtrud_private.notify_security_event(p_user_id uuid, p_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_kind = 'password_changed' THEN
    PERFORM public.notify_user(p_user_id, 'Пароль изменён',
      'Если это сделали не вы — сразу напишите в поддержку.',
      jsonb_build_object('type', 'security', 'kind', p_kind));
  ELSIF p_kind = 'phone_changed' THEN
    PERFORM public.notify_user(p_user_id, 'Номер для входа изменён',
      'Если это сделали не вы — сразу напишите в поддержку.',
      jsonb_build_object('type', 'security', 'kind', p_kind));
  ELSE
    RAISE EXCEPTION 'bad_kind' USING errcode = '22023';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.notify_security_event(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION xtrud_private.notify_security_event(uuid, text) TO xtrud_api;

-- 4. Синтетический адрес входа — за текущим номером (2 аккаунта на
--    2026-10-04, следы прямого UPDATE номера). Только где адрес свободен.
UPDATE auth.users u
   SET email = right(regexp_replace(up.phone, '\D', '', 'g'), 11) || '@phone.xtrud.pro',
       updated_at = now()
  FROM public.users_private up
 WHERE up.user_id = u.id
   AND lower(u.email) LIKE '%@phone.xtrud.pro'
   AND regexp_replace(up.phone, '\D', '', 'g') ~ '^7\d{10}$'
   AND right(regexp_replace(up.phone, '\D', '', 'g'), 10) <> right(split_part(u.email, '@', 1), 10)
   AND NOT EXISTS (
     SELECT 1 FROM auth.users o
      WHERE o.id <> u.id
        AND lower(o.email) = right(regexp_replace(up.phone, '\D', '', 'g'), 11) || '@phone.xtrud.pro');

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.users_private', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.users_private', 'INSERT')
     OR has_table_privilege('authenticated', 'public.users_private', 'DELETE')
     OR has_column_privilege('authenticated', 'public.users_private', 'phone', 'UPDATE') THEN
    RAISE EXCEPTION '0220_write_still_granted';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.users_private', 'SELECT') THEN
    RAISE EXCEPTION '0220_select_lost';
  END IF;
  IF NOT has_function_privilege('xtrud_api', 'xtrud_private.change_account_phone(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.change_account_phone(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0220_function_grants';
  END IF;
  IF NOT has_function_privilege('xtrud_api', 'xtrud_private.notify_security_event(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.notify_security_event(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0220_notify_grants';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
