-- Откат 0257: notify_security_event — тело 0220, без account_is_staff.
BEGIN;
DROP FUNCTION IF EXISTS xtrud_private.account_is_staff(uuid);
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
  ELSE
    RAISE EXCEPTION 'bad_kind' USING errcode = '22023';
  END IF;
END;
$function$;
COMMIT;
