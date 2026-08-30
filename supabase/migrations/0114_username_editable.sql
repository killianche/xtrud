-- 0114_username_editable.sql
--
-- Юзернейм теперь РЕДАКТИРУЕМЫЙ (фидбэк владельца 2026-05-29). Раньше (0112)
-- ставился один раз. Теперь set_username и ставит, и меняет, с проверкой
-- уникальности, исключая самого пользователя. is_username_available тоже
-- исключает текущего — свой юзернейм показывается как «свободен».
--
-- Применено к prod через MCP apply_migration (username_editable_set_or_update).

CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_norm text := lower(trim(p_username));
BEGIN
  IF v_norm IS NULL OR v_norm !~ '^[a-z0-9_.]{3,30}$' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(username) = v_norm
      AND (v_user_id IS NULL OR id <> v_user_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_username(p_username text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_norm text := lower(trim(p_username));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_norm IS NULL OR v_norm !~ '^[a-z0-9_.]{3,30}$' THEN
    RAISE EXCEPTION 'username_invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(username) = v_norm AND id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'username_taken' USING ERRCODE = '23505';
  END IF;
  UPDATE public.users SET username = v_norm WHERE id = v_user_id;
END;
$function$;
