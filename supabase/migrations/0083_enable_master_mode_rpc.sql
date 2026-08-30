-- 0083_enable_master_mode_rpc.sql
-- Быстрое превращение клиента в мастера через RPC enable_master_mode().
-- Создаёт скрытый master_profile (status=pending, is_hidden_from_search=true).
-- См. подробности в комментарии RPC внутри.

CREATE OR REPLACE FUNCTION public.enable_master_mode()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  UPDATE public.users
  SET is_master = true,
      active_role = 'master',
      onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.master_profiles (user_id, status, is_hidden_from_search)
  VALUES (v_user_id, 'pending', true)
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enable_master_mode() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.enable_master_mode() FROM anon, public;
