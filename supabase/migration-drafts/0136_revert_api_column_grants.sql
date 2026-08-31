-- ЧЕРНОВИК ОТКАТА для 0135_api_column_grants.sql.
--
-- Откат не «выдаёт GRANT ALL обратно по памяти»: это восстановило бы то, что
-- мы считаем правильным, а не то, что было. Он проигрывает точный ACL из
-- снимка public.api_grants_baseline_0135, который делает сама 0135, и затем
-- сверяет результат с этим снимком поколоночно. Если совпадения нет — падает,
-- а не сообщает об успехе.
--
-- Это важно из-за того же свойства PostgreSQL, что и в 0135: привилегии
-- таблицы и колонок связаны, и «примерно такой же» набор грантов может тихо
-- отличаться от исходного (например, потерять WITH GRANT OPTION или
-- привилегию MAINTAIN, появившуюся в PostgreSQL 17).
--
-- Что откат НЕ делает:
--   * не возвращает данные: миграция 0135 данные не меняет;
--   * не трогает политики RLS: 0135 их не трогает;
--   * не удаляет колонок и функций.

\set ON_ERROR_STOP on

DO $revert$
DECLARE
  r RECORD;
  v_tables CONSTANT text[] := ARRAY['users', 'master_profiles', 'orders', 'order_responses'];
  v_tbl text;
  v_grantee text;
  v_was_secdef boolean;
  v_diff text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'api_column_grants_revert_requires_database_owner'
      USING DETAIL = format('current_user = %L', current_user);
  END IF;

  IF to_regclass('public.api_grants_baseline_0135') IS NULL THEN
    RAISE EXCEPTION 'api_column_grants_revert_without_baseline'
      USING DETAIL = 'public.api_grants_baseline_0135 отсутствует: 0135 не применялась или уже откачена.',
            HINT = 'Восстанавливать гранты «на глаз» запрещено: нужен снимок ACL до изменения.';
  END IF;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM public.api_grants_baseline_0135
                    WHERE table_name = v_tbl AND column_name IS NULL) THEN
      RAISE EXCEPTION 'api_column_grants_revert_incomplete_baseline'
        USING DETAIL = format('в снимке нет табличного ACL для public.%I', v_tbl);
    END IF;
  END LOOP;

  -- 1. Полностью снимаем всё, что имеют API-роли. REVOKE ALL на уровне
  --    таблицы снимает и колоночные привилегии тех же ролей.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_tbl);
  END LOOP;

  -- 2. Проигрываем табличные привилегии из снимка.
  FOR r IN
    SELECT b.table_name, a.grantee::regrole::text AS grantee_name,
           a.privilege_type, a.is_grantable
      FROM public.api_grants_baseline_0135 b
      CROSS JOIN LATERAL aclexplode(b.acl) a
     WHERE b.column_name IS NULL
       AND b.acl IS NOT NULL
       AND a.grantee::regrole::text IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('GRANT %s ON public.%I TO %I%s',
                   r.privilege_type, r.table_name, r.grantee_name,
                   CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- 3. Проигрываем колоночные привилегии из снимка.
  FOR r IN
    SELECT b.table_name, b.column_name, a.grantee::regrole::text AS grantee_name,
           a.privilege_type, a.is_grantable
      FROM public.api_grants_baseline_0135 b
      CROSS JOIN LATERAL aclexplode(b.acl) a
     WHERE b.column_name IS NOT NULL
       AND b.acl IS NOT NULL
       AND a.grantee::regrole::text IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('GRANT %s (%I) ON public.%I TO %I%s',
                   r.privilege_type, r.column_name, r.table_name, r.grantee_name,
                   CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- 4. Возвращаем режим исполнения recalc_master_rating().
  SELECT (meta ->> 'prosecdef')::boolean INTO v_was_secdef
    FROM public.api_grants_baseline_0135
   WHERE table_name = 'pg_proc:recalc_master_rating';

  IF v_was_secdef IS NULL THEN
    RAISE EXCEPTION 'api_column_grants_revert_missing_function_baseline'
      USING DETAIL = 'В снимке нет исходного режима recalc_master_rating().';
  END IF;

  EXECUTE format('ALTER FUNCTION public.recalc_master_rating() %s',
                 CASE WHEN v_was_secdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END);

  -- 5. Сверка: фактический ACL обязан совпасть со снимком по каждой паре
  --    (роль, привилегия) — и на таблице, и на колонке.
  SELECT string_agg(d, E'\n' ORDER BY d) INTO v_diff FROM (
    -- есть сейчас, но не было в снимке
    SELECT format('лишнее: %s %s.%s -> %s', now_acl.privilege_type, now_acl.tbl,
                  coalesce(now_acl.col, '(таблица)'), now_acl.grantee_name) AS d
      FROM (
        SELECT c.relname AS tbl, NULL::text AS col, a.grantee::regrole::text AS grantee_name,
               a.privilege_type, a.is_grantable
          FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
         WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (v_tables)
        UNION ALL
        SELECT c.relname, at.attname, a.grantee::regrole::text, a.privilege_type, a.is_grantable
          FROM pg_class c
          JOIN pg_attribute at ON at.attrelid = c.oid AND at.attnum > 0 AND NOT at.attisdropped
          CROSS JOIN LATERAL aclexplode(at.attacl) a
         WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (v_tables)
      ) now_acl
     WHERE now_acl.grantee_name IN ('anon', 'authenticated')
       AND NOT EXISTS (
         SELECT 1 FROM public.api_grants_baseline_0135 b
         CROSS JOIN LATERAL aclexplode(b.acl) ba
          WHERE b.table_name = now_acl.tbl
            AND b.column_name IS NOT DISTINCT FROM now_acl.col
            AND ba.grantee::regrole::text = now_acl.grantee_name
            AND ba.privilege_type = now_acl.privilege_type
            AND ba.is_grantable = now_acl.is_grantable)

    UNION ALL

    -- было в снимке, но не восстановилось
    SELECT format('потеряно: %s %s.%s -> %s', was.privilege_type, was.tbl,
                  coalesce(was.col, '(таблица)'), was.grantee_name)
      FROM (
        SELECT b.table_name AS tbl, b.column_name AS col, ba.grantee::regrole::text AS grantee_name,
               ba.privilege_type, ba.is_grantable
          FROM public.api_grants_baseline_0135 b
          CROSS JOIN LATERAL aclexplode(b.acl) ba
         WHERE b.acl IS NOT NULL
      ) was
     WHERE was.grantee_name IN ('anon', 'authenticated')
       AND NOT EXISTS (
         SELECT 1 FROM (
           SELECT c.relname AS tbl, NULL::text AS col, a.grantee::regrole::text AS grantee_name,
                  a.privilege_type, a.is_grantable
             FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
            WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (v_tables)
           UNION ALL
           SELECT c.relname, at.attname, a.grantee::regrole::text, a.privilege_type, a.is_grantable
             FROM pg_class c
             JOIN pg_attribute at ON at.attrelid = c.oid AND at.attnum > 0 AND NOT at.attisdropped
             CROSS JOIN LATERAL aclexplode(at.attacl) a
            WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (v_tables)
         ) nw
          WHERE nw.tbl = was.tbl
            AND nw.col IS NOT DISTINCT FROM was.col
            AND nw.grantee_name = was.grantee_name
            AND nw.privilege_type = was.privilege_type
            AND nw.is_grantable = was.is_grantable)
  ) diffs;

  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION 'api_column_grants_revert_acl_mismatch'
      USING DETAIL = E'ACL после отката не совпал со снимком:\n' || v_diff;
  END IF;

  RAISE NOTICE 'api_column_grants_revert: ACL восстановлен и сверен со снимком.';
END
$revert$;

-- Снимок больше не нужен: он существует только ради этого отката.
DROP TABLE IF EXISTS public.api_grants_baseline_0135;
