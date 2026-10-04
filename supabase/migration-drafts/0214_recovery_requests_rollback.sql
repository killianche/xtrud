-- Откат 0214: заявки «Забыли пароль?». Заявки удаляются вместе с таблицей —
-- перед откатом выгрузить открытые, если они есть:
--   SELECT * FROM xtrud_private.recovery_requests WHERE status = 'new';
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0214_rollback_must_run_as_postgres';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_resolve_recovery_request(uuid, text, text);
-- Журнал: записи о закрытии заявок остаются (журнал неизменяем), поэтому
-- ограничение не сужается обратно — лишнее значение безвредно.
DROP FUNCTION IF EXISTS public.admin_list_recovery_requests(text, integer, integer);
DROP FUNCTION IF EXISTS xtrud_private.create_recovery_request(text);
DROP TABLE IF EXISTS xtrud_private.recovery_requests;
REVOKE USAGE ON SCHEMA xtrud_private FROM xtrud_api;

-- admin_set_user_password — тело до 0214 (без отзыва сессий).
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

  PERFORM public.admin_log_action(
    'set_password', 'user', p_user_id, p_reason, NULL,
    jsonb_build_object('by', 'admin_panel')
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;


NOTIFY pgrst, 'reload schema';

COMMIT;
