-- 0248: защита имён и названий от подмены (№309, 2026-10-08).
--
-- Найдено ревью №308: название компании и имя пропускали похожие буквы
-- другого алфавита («Пoддержка» с латинской o) и слова Admin/Support — так
-- можно выдать себя за площадку. Имена пользователей база не проверяла вовсе.
--
-- Правило (xtrud_private.name_text_valid):
--   * без невидимых и управляющих символов (U+200B…, bidi, C0/C1, U+FEFF);
--   * в одном слове нет кириллицы вместе с латиницей — кроме латинских I и l:
--     ими в ингушских именах пишут палочку Ӏ («ГIалгIай»);
--   * без слов, которыми выдают себя за площадку: xtrud, поддержк, админ,
--     администра, модерат, support, admin, moder, official, официальн,
--     verified, подтвержд.
-- Где действует:
--   * company_name_valid (0245) — плюс это правило;
--   * users.first_name / last_name — триггер на вставку и на изменение имени
--     (старые имена не перепроверяются). Админам не мешает: их имя
--     «Администратор» — служебное, флаг is_admin пользователь сам не ставит.
-- Приложение проверяет то же самое до отправки (src/lib/name-check.ts) —
-- человек видит понятный текст, база — второй рубеж.
--
-- Откат: 0248_name_guard_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0248_must_run_as_postgres';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'xtrud_private.company_name_valid(text)'::regprocedure)
     IS DISTINCT FROM 'e523b1dc372cc1b1c29cc46fa280b96b' THEN
    RAISE EXCEPTION '0248_company_name_valid_changed';
  END IF;
  IF to_regprocedure('xtrud_private.name_text_valid(text)') IS NOT NULL THEN
    RAISE EXCEPTION '0248_already_applied';
  END IF;
END;
$$;

CREATE FUNCTION xtrud_private.name_text_valid(p_text text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT p_text IS NULL OR (
    p_text !~ '[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]'
    AND p_text !~ '[А-Яа-яЁёӀӏ][^[:space:]]*[A-HJ-Za-km-z]|[A-HJ-Za-km-z][^[:space:]]*[А-Яа-яЁёӀӏ]'
    AND p_text !~* '(xtrud|икстру|поддержк|администра|админ|модерат|support|admin|moder|official|официальн|verified|подтвержд)'
  );
$function$;
REVOKE ALL ON FUNCTION xtrud_private.name_text_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Название компании: правило 0245 + name_text_valid.
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
    AND p_name !~* '(xtrud|икстру|поддержк|администрац|модерат|подтвержд|проверен|официальн|verified|official)'
    AND xtrud_private.name_text_valid(p_name),
    false);
$function$;

CREATE FUNCTION xtrud_private.guard_user_names()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.is_admin THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.first_name IS DISTINCT FROM OLD.first_name)
     AND NOT xtrud_private.name_text_valid(NEW.first_name) THEN
    RAISE EXCEPTION 'Имя — буквами одного алфавита, без слов «поддержка», «админ», «xtrud».'
      USING errcode = '22023', hint = 'bad_name';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.last_name IS DISTINCT FROM OLD.last_name)
     AND NOT xtrud_private.name_text_valid(NEW.last_name) THEN
    RAISE EXCEPTION 'Фамилия — буквами одного алфавита, без слов «поддержка», «админ», «xtrud».'
      USING errcode = '22023', hint = 'bad_name';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.guard_user_names()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER users_guard_names
  BEFORE INSERT OR UPDATE OF first_name, last_name ON public.users
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.guard_user_names();

-- Самопроверка правила.
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['Руслан', 'ГIалгIай', 'Ӏалиев', 'Ruslan', 'Анна-Мария', 'O''Brien',
                           'Крутые семечки', 'Ремонт-Сервис 24', 'Ёлка «Ромашка» № 1 (ООО) & Co.'] LOOP
    IF NOT xtrud_private.name_text_valid(v) THEN
      RAISE EXCEPTION '0248_rejects_valid: %', v;
    END IF;
  END LOOP;
  FOREACH v IN ARRAY ARRAY['Пoддержка', 'Сeмечки', 'Admin', 'Support', 'xtrud', 'Модератор',
                           'Ру' || chr(8203) || 'слан', 'Ad' || chr(8238) || 'min', 'Админ Ахмед'] LOOP
    IF xtrud_private.name_text_valid(v) THEN
      RAISE EXCEPTION '0248_accepts_invalid: %', v;
    END IF;
  END LOOP;
  IF NOT xtrud_private.company_name_valid('Крутые семечки')
     OR xtrud_private.company_name_valid('Крутые сeмечки') THEN
    RAISE EXCEPTION '0248_company_name_check';
  END IF;
  IF has_function_privilege('authenticated', 'xtrud_private.name_text_valid(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.guard_user_names()', 'EXECUTE') THEN
    RAISE EXCEPTION '0248_private_exposed';
  END IF;
END;
$$;

COMMIT;
