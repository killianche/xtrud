-- ЧЕРНОВИК. Шаг 1 «закалка базы» из docs/ADMIN_PANEL.md §9.1, часть 2 из 4:
-- функция public.is_admin_session().
--
-- НЕ ПРИМЕНЯТЬ ПО ИМЕНИ ФАЙЛА. Условия продвижения — supabase/migration-drafts/README.md.
--
-- ===========================================================================
-- ТРЕБОВАНИЕ (docs/ADMIN_PANEL.md §6)
-- ===========================================================================
--
--   «Признак админа проверяется чтением БД, а не клеймом в JWT: отзыв прав
--    должен действовать мгновенно.»
--   «Второй фактор обязателен, TOTP, и проверяется в базе через aal2.»
--
-- Действующая public.is_current_user_admin() (0030_admin_flag_and_policies.sql)
-- выполняет только первую половину: читает users.is_admin из БД, но ничего не
-- знает о втором факторе. Украденный пароль даёт полные права модератора.
--
-- ===========================================================================
-- ПОЧЕМУ УРОВЕНЬ ДОВЕРИЯ ЧИТАЕТСЯ ИЗ auth.sessions, А НЕ ИЗ КЛЕЙМА JWT
-- ===========================================================================
--
-- Проще всего было бы написать `auth.jwt() ->> 'aal' = 'aal2'`. Это слабее по
-- той же причине, по которой §6 запрещает брать is_admin из JWT: клейм —
-- слепок на момент выпуска токена. Access token живёт около часа; выход из
-- сессии, отзыв фактора или завершение сессии администратором не отменяют уже
-- выданный токен. Признак, вычитанный из auth.sessions, отменяется мгновенно.
--
-- FACT (read-only production, 2026-08-31):
--   * auth.sessions существует и имеет колонку aal типа auth.aal_level;
--   * auth.mfa_factors существует;
--   * владелец базы (postgres) имеет SELECT на обе таблицы и USAGE на схему
--     auth — значит SECURITY DEFINER функция, принадлежащая postgres, может
--     их читать, а роли anon/authenticated — нет;
--   * SELECT count(*) FROM auth.mfa_factors f JOIN public.users u
--       ON u.id=f.user_id WHERE u.is_admin AND f.status='verified'  ->  0.
--
-- Последний факт означает: на момент написания черновика ни у одного
-- администратора нет подтверждённого второго фактора. Сама по себе эта
-- миграция аддитивна и ничего не ломает — is_admin_session() пока никем не
-- используется. Но миграция 0141, которая переводит админскую политику на
-- неё, обязана отказаться применяться, пока фактора нет. Это её работа, не
-- этой; здесь только фиксируем причину.
--
-- ===========================================================================
-- ЧТО ЭТА МИГРАЦИЯ НЕ ДЕЛАЕТ
-- ===========================================================================
--
--  * не трогает и не заменяет is_current_user_admin(): её продолжают
--    использовать политики reports_admin_select, reports_admin_update,
--    reviews_admin_update и (до 0141) users_admin_update. Замена «на месте»
--    мгновенно отключила бы модерацию, а порядок из §10 требует обратного;
--  * не создаёт политик и не выдаёт прав на данные;
--  * не включает MFA в GoTrue: это внешнее действие владельца.
--
-- Откат: 0138_revert_admin_session_function.sql.

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1. Preflight — fail-closed
-- ===========================================================================

DO $preflight$
DECLARE
  v_aal_type text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'admin_session_requires_database_owner'
      USING DETAIL = format('current_user = %L; SECURITY DEFINER должен принадлежать владельцу базы, а не API-роли', current_user);
  END IF;

  IF to_regclass('auth.sessions') IS NULL THEN
    RAISE EXCEPTION 'admin_session_requires_auth_sessions'
      USING DETAIL = 'auth.sessions отсутствует.',
            HINT = 'Без неё уровень доверия можно взять только из клейма JWT, а это молчаливое ослабление требования §6. Черновик отказывается деградировать.';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod) INTO v_aal_type
    FROM pg_attribute a
   WHERE a.attrelid = 'auth.sessions'::regclass AND a.attname = 'aal' AND NOT a.attisdropped;

  IF v_aal_type IS NULL THEN
    RAISE EXCEPTION 'admin_session_requires_auth_sessions_aal'
      USING DETAIL = 'В auth.sessions нет колонки aal.';
  END IF;

  IF to_regclass('auth.mfa_factors') IS NULL THEN
    RAISE EXCEPTION 'admin_session_requires_auth_mfa_factors'
      USING DETAIL = 'auth.mfa_factors отсутствует: без неё нельзя проверить, что второй фактор вообще возможен.';
  END IF;

  IF NOT has_table_privilege(current_user, 'auth.sessions', 'SELECT')
     OR NOT has_table_privilege(current_user, 'auth.mfa_factors', 'SELECT') THEN
    RAISE EXCEPTION 'admin_session_owner_cannot_read_auth'
      USING DETAIL = format('%L не может читать auth.sessions/auth.mfa_factors', current_user),
            HINT = 'SECURITY DEFINER функция унаследует эту же нехватку и будет всегда возвращать false — то есть модерация окажется заперта.';
  END IF;

  -- API-роли не должны читать auth напрямую: иначе смысл SECURITY DEFINER
  -- теряется, а список активных сессий становится публичным.
  IF has_table_privilege('anon', 'auth.sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'auth.sessions', 'SELECT') THEN
    RAISE EXCEPTION 'admin_session_auth_sessions_readable_by_api_role'
      USING DETAIL = 'anon или authenticated имеют SELECT на auth.sessions.',
            HINT = 'Сначала снять этот грант отдельной задачей: это утечка списка сессий, а не деталь этой миграции.';
  END IF;

  IF to_regproc('public.is_current_user_admin') IS NULL THEN
    RAISE EXCEPTION 'admin_session_requires_existing_admin_helper'
      USING DETAIL = 'public.is_current_user_admin() из 0030 отсутствует; это не тот backend, под который писался черновик.';
  END IF;
END
$preflight$;

-- ===========================================================================
-- 2. Функция
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.is_admin_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT
    -- 1. Признак администратора — ЧТЕНИЕМ ИЗ БД, не из клейма JWT.
    --    Отзыв прав через UPDATE users SET is_admin=false действует сразу,
    --    не дожидаясь истечения access token.
    EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.is_admin
         AND NOT u.is_demo          -- инвариант users_demo_is_never_admin (0131)
         AND u.status = 'active'    -- заблокированный администратор не модератор
    )
    AND
    -- 2. Второй фактор — тоже ЧТЕНИЕМ ИЗ БД. Клейм 'aal' в токене не
    --    спрашивается: он не отзывается до конца жизни токена.
    --    Отсутствующий session_id, чужая сессия, истёкшая сессия и aal1 —
    --    все дают false. Фейл-клоуз по умолчанию.
    EXISTS (
      SELECT 1
        FROM auth.sessions s
       WHERE s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
         AND s.user_id = auth.uid()
         AND s.aal = 'aal2'
         AND (s.not_after IS NULL OR s.not_after > now())
    );
$fn$;

COMMENT ON FUNCTION public.is_admin_session() IS
  'true только если текущая сессия принадлежит активному не-demo администратору (признак читается из public.users) И имеет уровень доверия aal2 (читается из auth.sessions, а не из клейма JWT). docs/ADMIN_PANEL.md §6.';

-- Права: функция ничего не раскрывает сама по себе, но её незачем давать
-- анонимам — anon никогда не может быть администратором.
REVOKE ALL ON FUNCTION public.is_admin_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_session() TO authenticated;

-- ===========================================================================
-- 3. Самопроверка
-- ===========================================================================

DO $verify$
DECLARE
  v_owner name;
  v_secdef boolean;
  v_result boolean;
BEGIN
  SELECT pg_get_userbyid(p.proowner), p.prosecdef INTO v_owner, v_secdef
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'is_admin_session' AND p.pronargs = 0;

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'admin_session_not_security_definer';
  END IF;

  IF v_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'admin_session_owned_by_api_role' USING DETAIL = format('владелец %L', v_owner);
  END IF;

  IF has_function_privilege('anon', 'public.is_admin_session()', 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_session_executable_by_anon';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.is_admin_session()', 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_session_not_executable_by_authenticated';
  END IF;

  -- Фейл-клоуз: без клеймов сессии функция обязана вернуть false, а не NULL
  -- и не ошибку. NULL в USING-выражении политики означает «строка не видна»,
  -- но полагаться на это нельзя — проверяем явно.
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT public.is_admin_session() INTO v_result;
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'admin_session_not_fail_closed'
      USING DETAIL = format('без JWT функция вернула %L вместо false', v_result);
  END IF;

  RAISE NOTICE 'admin_session: is_admin_session() создана, SECURITY DEFINER (владелец %), anon без EXECUTE, без JWT возвращает false.', v_owner;
END
$verify$;
