-- 0224 откат: прежние права (снова дыра H1 — только при аварии) и прежний триггер.
BEGIN;
DO $$ BEGIN IF current_user <> 'postgres' THEN RAISE EXCEPTION '0224_rollback_must_run_as_postgres'; END IF; END $$;
GRANT INSERT, UPDATE ON public.master_verifications TO authenticated;
CREATE OR REPLACE FUNCTION public.sync_master_verification_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.master_profiles
     SET verification_level =
           CASE WHEN NEW.verified_at IS NOT NULL AND NEW.revoked_at IS NULL
                THEN 2 ELSE 1 END,
         updated_at = now()
   WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$function$

;
COMMIT;
