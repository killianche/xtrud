-- 0257: вход по номеру без пароля (№380, владелец 2026-11-09).
--
-- 1. xtrud_private.account_is_staff(uuid) — админ или управляющий. Тестовые
--    номера (ревьюер магазинов, CALLCHECK_TEST_PHONES) входят без звонка;
--    сервер отказывает, если такой номер стоит на аккаунте сотрудника
--    (ревью xtrud-security H1: ошибка настройки не должна открывать админку).
-- 2. notify_security_event: новый вид 'new_sign_in' — «Новый вход в аккаунт».
--    Вход звонком заменил пароль, и о входе с другого устройства владелец
--    аккаунта теперь узнаёт (ревью M4). Прежние виды не меняются.
-- Права роли API: только EXECUTE на эти функции.
-- Откат: 0257_call_login_guards_rollback.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION xtrud_private.account_is_staff(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT u.is_admin OR u.staff_role IS NOT NULL FROM public.users u WHERE u.id = p_user_id),
    false);
$function$;
REVOKE ALL ON FUNCTION xtrud_private.account_is_staff(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION xtrud_private.account_is_staff(uuid) TO xtrud_api;

CREATE OR REPLACE FUNCTION xtrud_private.notify_security_event(p_user_id uuid, p_kind text)
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
  ELSIF p_kind = 'new_sign_in' THEN
    PERFORM public.notify_user(p_user_id, 'Новый вход в аккаунт',
      'Если это были не вы — сразу напишите в поддержку.',
      jsonb_build_object('type', 'security', 'kind', p_kind));
  ELSE
    RAISE EXCEPTION 'bad_kind' USING errcode = '22023';
  END IF;
END;
$function$;

COMMIT;
