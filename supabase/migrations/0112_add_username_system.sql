-- 0112_add_username_system.sql
--
-- Система юзернеймов (стабильный публичный идентификатор, как @ingush в Instagram).
-- Решение владельца 2026-05-28: при регистрации человек создаёт уникальный
-- юзернейм, закреплённый за ним один раз. Даёт стабильную личность независимо
-- от номера телефона (помогает при смене номера + ручном восстановлении через
-- поддержку под service_role).
--
-- Формат: 3–30 символов, латиница нижнего регистра + цифры + точка + подчёркивание.
-- Уникальность регистронезависимая. Колонка nullable — существующие аккаунты
-- остаются без юзернейма (для них необязателен).
--
-- Применено к prod через MCP apply_migration (add_username_system).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_username_format_chk;
ALTER TABLE public.users
  ADD CONSTRAINT users_username_format_chk
  CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,30}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uk
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.users.username IS
  'Уникальный публичный юзернейм (как @ingush). Закрепляется один раз через RPC set_username. 3-30 символов: a-z 0-9 _ . (нижний регистр).';

CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_norm text := lower(trim(p_username));
BEGIN
  IF v_norm IS NULL OR v_norm !~ '^[a-z0-9_.]{3,30}$' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.users WHERE lower(username) = v_norm
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
  v_current text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_norm IS NULL OR v_norm !~ '^[a-z0-9_.]{3,30}$' THEN
    RAISE EXCEPTION 'username_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT username INTO v_current FROM public.users WHERE id = v_user_id;

  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'username_already_set' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE lower(username) = v_norm) THEN
    RAISE EXCEPTION 'username_taken' USING ERRCODE = '23505';
  END IF;

  UPDATE public.users SET username = v_norm WHERE id = v_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_username_available(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_username(text) TO authenticated;
