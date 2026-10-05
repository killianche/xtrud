-- 0224: специалист не может сам поставить себе «паспорт проверен» (ревью
-- xtrud-security 2026-10-05, H1; владелец: «исправь ошибки»).
--
-- FACT (пробная запись с ROLLBACK 2026-10-05): специалист вставлял свою строку
-- master_verifications с verified_at = now() — политика owner_insert проверяла
-- только status/reviewed_*, у authenticated было право писать verified_at, а
-- триггер sync_master_verification_level ставил verification_level = 2 по
-- одному verified_at, не глядя на статус. Итог — значок «Паспорт проверен» без
-- проверки; с 0225 такие ещё и выше в поиске.
--
-- Было: authenticated — INSERT/UPDATE на все 13 колонок master_verifications.
-- Стало:
--   - authenticated пишет только то, что шлёт приложение: user_id,
--     passport_main_path, selfie_path, status, submitted_at, reviewed_at,
--     reviewed_by, rejection_reason (последние три политика пускает только
--     NULL — повторная подача их сбрасывает); verified_at, revoked_at,
--     revoked_reason, verified_first_name, verified_last_name — только
--     функции админки (SECURITY DEFINER);
--   - триггер ставит уровень 2 только при status = 'approved' (так одобряет
--     admin_review_verification).
--
-- Откат: 0224_verification_self_approve_closed_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0224_must_run_as_postgres';
  END IF;
  IF md5(pg_get_functiondef('public.sync_master_verification_level()'::regprocedure))
     IS DISTINCT FROM '2f74a974fe8d91d6a7330d068f414c0b' THEN
    RAISE EXCEPTION '0224_trigger_function_changed';
  END IF;
  -- Сейчас поддельных значков нет (FACT 2026-10-05: 0 строк verified_at без reviewed_by).
  IF EXISTS (SELECT 1 FROM public.master_verifications
              WHERE verified_at IS NOT NULL AND (status <> 'approved' OR reviewed_by IS NULL)) THEN
    RAISE EXCEPTION '0224_suspicious_rows_review_first';
  END IF;
END;
$$;

REVOKE INSERT, UPDATE ON public.master_verifications FROM authenticated;
GRANT INSERT (user_id, passport_main_path, selfie_path, status, submitted_at,
              reviewed_at, reviewed_by, rejection_reason)
   ON public.master_verifications TO authenticated;
GRANT UPDATE (passport_main_path, selfie_path, status, submitted_at,
              reviewed_at, reviewed_by, rejection_reason)
   ON public.master_verifications TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_master_verification_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Уровень 2 — только одобренная админом проверка (0224).
  UPDATE public.master_profiles
     SET verification_level =
           CASE WHEN NEW.status = 'approved' AND NEW.verified_at IS NOT NULL
                     AND NEW.revoked_at IS NULL
                THEN 2 ELSE 1 END,
         updated_at = now()
   WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.master_verifications', 'verified_at', 'INSERT')
     OR has_column_privilege('authenticated', 'public.master_verifications', 'verified_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_verifications', 'revoked_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_verifications', 'verified_first_name', 'UPDATE') THEN
    RAISE EXCEPTION '0224_still_writable';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.master_verifications', 'passport_main_path', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.master_verifications', 'rejection_reason', 'UPDATE') THEN
    RAISE EXCEPTION '0224_app_write_lost';
  END IF;
END;
$$;

COMMIT;
