-- ЧЕРНОВИК. Шаг 1 «закалка базы» из docs/ADMIN_PANEL.md §9.1, часть 4 из 4:
-- сужение политики users_admin_update.
--
-- НЕ ПРИМЕНЯТЬ ПО ИМЕНИ ФАЙЛА. Условия продвижения — supabase/migration-drafts/README.md.
--
-- ЗАВИСИМОСТИ: применённая 0130_guard_user_privilege_columns.sql и черновик
-- 0137_admin_session_function.sql. Обе проверяются в SQL по форме объекта, а
-- не по наличию имени.
--
-- ===========================================================================
-- ЧТО НА САМОМ ДЕЛЕ ОСТАЛОСЬ ОТКРЫТО
-- ===========================================================================
--
-- docs/ADMIN_PANEL.md §2 описывает следствие так: «Один админ молча создаёт
-- других, следа не остаётся». ПЕРВАЯ ПОЛОВИНА ЭТОГО УТВЕРЖДЕНИЯ УЖЕ НЕВЕРНА:
-- применённая миграция 0130 блокирует смену users.is_admin и users.is_demo
-- всем, кроме current_user = 'postgres'. Проверено чтением live-объекта
-- (триггер users_guard_privilege_columns включён на public.users).
--
-- Открытым остаётся другое, и это не мельче:
--
--   политика users_admin_update разрешает администратору UPDATE ЛЮБОЙ строки
--   public.users, а RLS не ограничивает колонки. Значит администратор может
--   переписать чужие имя, фамилию, аватар, город, район, контактный телефон,
--   активную роль и признак мастера. Это подмена личности и порча
--   персональных данных, а не «раздача прав».
--
-- Плюс вторая половина фразы верна полностью: следа не остаётся.
--
-- ===========================================================================
-- ПОЧЕМУ СУЖЕНИЕ — ЭТО ПОЛИТИКА ПЛЮС ТРИГГЕР
-- ===========================================================================
--
-- RLS ограничивает строки, а не колонки, и WITH CHECK не видит OLD-строку:
-- «поменялось только status» на языке политик не выражается. Ограничить
-- колонки грантами тоже нельзя — грант выдаётся роли authenticated целиком,
-- а администратор ходит под той же ролью, что и обычный пользователь.
--
-- Поэтому здесь два изменения:
--   1. политика users_admin_update переводится с is_current_user_admin() на
--      is_admin_session(), то есть требует ещё и подтверждённого второго
--      фактора (docs/ADMIN_PANEL.md §6);
--   2. триггер users_guard_admin_scope разрешает на админском пути менять
--      ТОЛЬКО users.status.
--
-- Триггер сравнивает строки целиком через to_jsonb(NEW)/to_jsonb(OLD), а не
-- перечисляет колонки. Это сделано намеренно: колонка, добавленная будущей
-- миграцией, автоматически окажется запрещённой, а не забытой.
--
-- ЭТО ОТДЕЛЬНЫЙ ТРИГГЕР, а не CREATE OR REPLACE функции из 0130. Расширение
-- применённой функции превратило бы откат в восстановление: 0142 пришлось бы
-- воссоздавать тело 0130 из копии в этом репозитории, и живой hotfix был бы
-- молча затёрт устаревшим текстом. Тот же довод записан в README для 0126.
--
-- ===========================================================================
-- ЦЕНА, КОТОРУЮ НАДО НАЗВАТЬ ДО ПРИМЕНЕНИЯ
-- ===========================================================================
--
-- После этой миграции админка внутри приложения перестаёт менять статус
-- пользователя: src/features/admin/use-admin.ts:80 ходит обычной сессией без
-- второго фактора. Это ровно тот эффект, который docs/ADMIN_PANEL.md §10
-- называет вынужденным, и ровно та причина, по которой §10 требует порядок:
-- сначала работает веб-панель, потом урезается мобильная.
--
-- Чтобы миграция не могла создать окно без модерации, у неё есть жёсткое
-- предусловие: она ОТКАЗЫВАЕТСЯ применяться, если в базе нет ни одного
-- активного администратора с подтверждённым вторым фактором.
--
-- FACT (read-only production, 2026-08-31):
--   SELECT count(*) FROM auth.mfa_factors f
--     JOIN public.users u ON u.id = f.user_id
--    WHERE u.is_admin AND f.status = 'verified';   -- 0
--
-- То есть СЕЙЧАС эта миграция не применится, и это правильно: пока TOTP не
-- заведён, она заперла бы модерацию снаружи.
--
-- ЧЕГО ЭТА МИГРАЦИЯ НЕ ДЕЛАЕТ: не пишет журнал. Прямой UPDATE статуса
-- невозможно снабдить обязательной причиной — причина появляется только
-- вместе с RPC шага 2, которые вызывают public.admin_log_action(). До этого
-- админское изменение статуса остаётся незажурналированным, и это ещё один
-- довод в пользу порядка из §9.
--
-- Откат: 0142_revert_narrow_admin_user_update.sql.

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1. Preflight — fail-closed
-- ===========================================================================

DO $preflight$
DECLARE
  v_oid oid;
  v_secdef boolean;
  v_owner name;
  v_src text;
  v_rettype text;
  v_admins integer;
  v_mfa integer;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'narrow_admin_update_requires_database_owner'
      USING DETAIL = format('current_user = %L', current_user);
  END IF;

  -- 1.1 Применённая 0130 обязана стоять и быть именно тем объектом, который
  --     она поставила. Одного имени недостаточно.
  SELECT p.oid, p.prosecdef, pg_get_userbyid(p.proowner), p.prosrc,
         pg_get_function_result(p.oid)
    INTO v_oid, v_secdef, v_owner, v_src, v_rettype
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'guard_user_privilege_columns'
     AND p.pronargs = 0;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'narrow_admin_update_requires_is_admin_guard'
      USING DETAIL = 'Применённая миграция 0130 отсутствует.',
            HINT = 'Сужать админскую политику раньше замка на is_admin бессмысленно: колонка останется писабельной.';
  END IF;

  IF v_rettype <> 'trigger' OR v_secdef OR v_owner IN ('anon', 'authenticated', 'service_role')
     OR v_src NOT LIKE '%is_admin%' THEN
    RAISE EXCEPTION 'narrow_admin_update_foreign_privilege_guard_requires_live_audit'
      USING DETAIL = format('guard_user_privilege_columns: returns=%s, prosecdef=%s, owner=%L', v_rettype, v_secdef, v_owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.users'::regclass
       AND t.tgname = 'users_guard_privilege_columns'
       AND NOT t.tgisinternal AND t.tgenabled <> 'D')
  THEN
    RAISE EXCEPTION 'narrow_admin_update_requires_is_admin_guard'
      USING DETAIL = 'Триггер users_guard_privilege_columns отсутствует или выключен.';
  END IF;

  -- 1.2 is_admin_session() обязана существовать и быть той самой.
  SELECT p.oid, p.prosecdef, pg_get_userbyid(p.proowner), p.prosrc
    INTO v_oid, v_secdef, v_owner, v_src
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'is_admin_session' AND p.pronargs = 0;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'narrow_admin_update_requires_admin_session_function'
      USING HINT = 'Сначала применить 0137_admin_session_function.sql.';
  END IF;

  IF NOT v_secdef OR v_owner IN ('anon', 'authenticated', 'service_role')
     OR v_src NOT LIKE '%auth.sessions%' OR v_src NOT LIKE '%aal2%' THEN
    RAISE EXCEPTION 'narrow_admin_update_foreign_admin_session_requires_live_audit'
      USING DETAIL = format('is_admin_session(): prosecdef=%s, владелец=%L', v_secdef, v_owner);
  END IF;

  -- 1.3 Политика, которую сужаем, обязана существовать в ожидаемом виде.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_admin_update')
  THEN
    RAISE EXCEPTION 'narrow_admin_update_policy_missing'
      USING DETAIL = 'Политики users_admin_update нет: живое состояние разошлось с 0030.';
  END IF;

  -- 1.4 Главное предусловие: после этой миграции модерация должна остаться
  --     физически возможной. Без активного администратора с подтверждённым
  --     вторым фактором она бы заперлась снаружи.
  SELECT count(*) INTO v_admins
    FROM public.users u
   WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active';

  IF v_admins = 0 THEN
    RAISE EXCEPTION 'narrow_admin_update_no_active_administrator'
      USING DETAIL = 'В базе нет активного не-demo администратора.',
            HINT = 'Сначала завести настоящего администратора (0132/0133), потом сужать политику.';
  END IF;

  IF to_regclass('auth.mfa_factors') IS NULL THEN
    RAISE EXCEPTION 'narrow_admin_update_requires_auth_mfa_factors';
  END IF;

  SELECT count(*) INTO v_mfa
    FROM auth.mfa_factors f
    JOIN public.users u ON u.id = f.user_id
   WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active'
     AND f.status = 'verified';

  IF v_mfa = 0 THEN
    RAISE EXCEPTION 'narrow_admin_update_would_lock_out_moderation'
      USING DETAIL = format('активных администраторов: %s, из них с подтверждённым вторым фактором: 0', v_admins),
            HINT = 'Сначала включить MFA в GoTrue и подтвердить TOTP-фактор администратора, а также написать процедуру восстановления при потере устройства (docs/ADMIN_PANEL.md §6, §11.3). Только потом применять эту миграцию.';
  END IF;

  RAISE NOTICE 'narrow_admin_update: предусловия выполнены (активных админов %, из них с подтверждённым фактором %).', v_admins, v_mfa;
END
$preflight$;

-- ===========================================================================
-- 2. Триггер: на админском пути меняется только status
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.guard_admin_user_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_changed text;
BEGIN
  -- Владелец базы обслуживает данные вручную; тем же выходом пользуются все
  -- SECURITY DEFINER функции, принадлежащие postgres (delete_my_account,
  -- handle_new_auth_user, touch_last_active и прочие). Тот же приём, что в 0130.
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Своя строка — это путь users_update_own, у него собственные ограничения
  -- (0130 плюс колоночные гранты 0135). Здесь он не рассматривается.
  IF NEW.id = (SELECT auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Остаётся админский путь. Сравниваем строки целиком, а не список колонок:
  -- колонка, добавленная будущей миграцией, должна оказаться запрещённой
  -- автоматически, а не забытой.
  SELECT string_agg(n.key, ', ' ORDER BY n.key)
    INTO v_changed
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
   WHERE n.value IS DISTINCT FROM o.value
     AND n.key <> ALL (ARRAY['status', 'updated_at']);

  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION 'Администратор может менять только статус пользователя'
      USING ERRCODE = '42501',
            DETAIL = format('попытка изменить чужие колонки: %s', v_changed),
            HINT = 'Санкция — это users.status. Всё остальное в чужой строке правится только владельцем базы.';
  END IF;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.guard_admin_user_scope() IS
  'Ограничивает админский путь UPDATE public.users одной колонкой status. RLS ограничивает строки, но не колонки, а WITH CHECK не видит OLD — поэтому это триггер. docs/ADMIN_PANEL.md §2.';

REVOKE ALL ON FUNCTION public.guard_admin_user_scope() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS users_guard_admin_scope ON public.users;
CREATE TRIGGER users_guard_admin_scope
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_user_scope();

-- ===========================================================================
-- 3. Политика
-- ===========================================================================

DROP POLICY users_admin_update ON public.users;

CREATE POLICY users_admin_update ON public.users
  FOR UPDATE
  USING (public.is_admin_session())
  WITH CHECK (public.is_admin_session());

COMMENT ON POLICY users_admin_update ON public.users IS
  'Админский путь записи в public.users: активный не-demo администратор в сессии aal2. Набор колонок ограничен триггером users_guard_admin_scope, потому что RLS колонки не ограничивает.';

-- ===========================================================================
-- 4. Самопроверка
-- ===========================================================================

DO $verify$
DECLARE
  v_qual text;
  v_check text;
BEGIN
  SELECT qual, with_check INTO v_qual, v_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_admin_update';

  IF coalesce(v_qual, '') NOT LIKE '%is_admin_session%'
     OR coalesce(v_check, '') NOT LIKE '%is_admin_session%' THEN
    RAISE EXCEPTION 'narrow_admin_update_policy_not_narrowed'
      USING DETAIL = format('USING=%s WITH CHECK=%s', v_qual, v_check);
  END IF;

  IF coalesce(v_qual, '') LIKE '%is_current_user_admin%' THEN
    RAISE EXCEPTION 'narrow_admin_update_policy_still_uses_old_helper';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.users'::regclass
       AND t.tgname = 'users_guard_admin_scope'
       AND NOT t.tgisinternal AND t.tgenabled <> 'D')
  THEN
    RAISE EXCEPTION 'narrow_admin_update_scope_trigger_missing';
  END IF;

  -- 0130 обязана остаться нетронутой: эта миграция её не заменяет.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.users'::regclass
       AND t.tgname = 'users_guard_privilege_columns'
       AND NOT t.tgisinternal AND t.tgenabled <> 'D')
  THEN
    RAISE EXCEPTION 'narrow_admin_update_broke_applied_0130'
      USING DETAIL = 'После миграции триггер 0130 не найден.';
  END IF;

  RAISE NOTICE 'narrow_admin_update: политика переведена на is_admin_session(), колонки ограничены триггером, 0130 на месте.';
END
$verify$;
