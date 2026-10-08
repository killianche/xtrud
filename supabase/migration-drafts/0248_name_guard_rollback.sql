-- Откат 0248: без проверки имён, company_name_valid — как в 0245.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TRIGGER users_guard_names ON public.users;
DROP FUNCTION xtrud_private.guard_user_names();

CREATE OR REPLACE FUNCTION xtrud_private.company_name_valid(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT coalesce(
    char_length(p_name) BETWEEN 2 AND 80
    AND p_name ~ '^[[:alpha:][:digit:] .,&"''«»()№+-]+$'
    AND p_name ~ '[[:alpha:][:digit:]]'
    AND p_name !~* '(xtrud|икстру|поддержк|администрац|модерат|подтвержд|проверен|официальн|verified|official)',
    false);
$function$;

DROP FUNCTION xtrud_private.name_text_valid(text);

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'xtrud_private.company_name_valid(text)'::regprocedure)
     IS DISTINCT FROM 'e523b1dc372cc1b1c29cc46fa280b96b' THEN
    RAISE EXCEPTION '0248r_company_name_valid_md5';
  END IF;
END;
$$;

COMMIT;
