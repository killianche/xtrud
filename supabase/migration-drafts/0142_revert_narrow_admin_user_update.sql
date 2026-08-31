-- ЧЕРНОВИК ОТКАТА для 0141_narrow_admin_user_update.sql.
--
-- Возвращает политику users_admin_update ровно к тексту применённой миграции
-- 0030_admin_flag_and_policies.sql и снимает триггер сужения. Это откат в
-- БОЛЕЕ ШИРОКОЕ состояние, поэтому он громко об этом сообщает: после него
-- администратор снова сможет переписывать любые колонки любого пользователя,
-- и второй фактор снова перестанет требоваться.
--
-- Откат намеренно НЕ трогает:
--   * применённую 0130 (замок на is_admin/is_demo) — она стояла до 0141;
--   * public.is_admin_session() — её удаляет 0138;
--   * журнал admin_actions — его удаляет 0140.

\set ON_ERROR_STOP on

DO $revert$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'narrow_admin_update_revert_requires_database_owner'
      USING DETAIL = format('current_user = %L', current_user);
  END IF;

  IF to_regproc('public.is_current_user_admin') IS NULL THEN
    RAISE EXCEPTION 'narrow_admin_update_revert_missing_legacy_helper'
      USING DETAIL = 'public.is_current_user_admin() из 0030 отсутствует.',
            HINT = 'Без неё откат создал бы политику, которая не компилируется, и оставил бы users без админского пути вовсе.';
  END IF;
END
$revert$;

DROP TRIGGER IF EXISTS users_guard_admin_scope ON public.users;
DROP FUNCTION IF EXISTS public.guard_admin_user_scope();

DROP POLICY IF EXISTS users_admin_update ON public.users;

-- Текст 0030_admin_flag_and_policies.sql, дословно.
CREATE POLICY users_admin_update ON public.users
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DO $verify$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_admin_update';

  IF coalesce(v_qual, '') NOT LIKE '%is_current_user_admin%' THEN
    RAISE EXCEPTION 'narrow_admin_update_revert_policy_not_restored' USING DETAIL = coalesce(v_qual, '(нет политики)');
  END IF;

  IF to_regproc('public.guard_admin_user_scope') IS NOT NULL THEN
    RAISE EXCEPTION 'narrow_admin_update_revert_trigger_function_survived';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.users'::regclass AND t.tgname = 'users_guard_admin_scope' AND NOT t.tgisinternal)
  THEN
    RAISE EXCEPTION 'narrow_admin_update_revert_trigger_survived';
  END IF;

  -- Применённая 0130 обязана пережить откат: 0141 её не трогала, и откат
  -- тоже не должен.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.users'::regclass
       AND t.tgname = 'users_guard_privilege_columns'
       AND NOT t.tgisinternal AND t.tgenabled <> 'D')
  THEN
    RAISE EXCEPTION 'narrow_admin_update_revert_broke_applied_0130';
  END IF;

  RAISE WARNING 'narrow_admin_update_revert: политика снова разрешает администратору писать ЛЮБУЮ колонку любого пользователя и не требует второго фактора.';
  RAISE NOTICE 'narrow_admin_update_revert: состояние 0030 восстановлено, 0130 на месте.';
END
$verify$;
