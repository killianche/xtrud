-- ЧЕРНОВИК ОТКАТА для 0137_admin_session_function.sql.
--
-- 0137 аддитивна: она только создаёт public.is_admin_session(). Откат — её
-- удаление. Он отказывается работать, пока функцией кто-то пользуется, иначе
-- откат тихо снёс бы условие доступа вместе с самим доступом.

\set ON_ERROR_STOP on

DO $revert$
DECLARE
  v_users text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'admin_session_revert_requires_database_owner'
      USING DETAIL = format('current_user = %L', current_user);
  END IF;

  IF to_regproc('public.is_admin_session') IS NULL THEN
    RAISE NOTICE 'admin_session_revert: функции нет, откат уже выполнен.';
    RETURN;
  END IF;

  -- 1. Ни одна политика не должна на неё ссылаться.
  SELECT string_agg(format('%s.%s', schemaname, policyname), ', ' ORDER BY policyname) INTO v_users
    FROM pg_policies
   WHERE coalesce(qual, '') LIKE '%is_admin_session%'
      OR coalesce(with_check, '') LIKE '%is_admin_session%';

  IF v_users IS NOT NULL THEN
    RAISE EXCEPTION 'admin_session_revert_still_referenced_by_policies'
      USING DETAIL = format('политики: %s', v_users),
            HINT = 'Сначала откатить 0141 (и всё, что перевело доступ на is_admin_session), потом эту.';
  END IF;

  -- 2. Ни одна функция не должна её вызывать.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_users
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname <> 'is_admin_session'
     AND p.prosrc LIKE '%is_admin_session%';

  IF v_users IS NOT NULL THEN
    RAISE EXCEPTION 'admin_session_revert_still_referenced_by_functions'
      USING DETAIL = format('функции: %s', v_users),
            HINT = 'Сначала откатить 0139 (журнал) и 0141 (политика), потом эту.';
  END IF;

  DROP FUNCTION public.is_admin_session();
  RAISE NOTICE 'admin_session_revert: is_admin_session() удалена.';
END
$revert$;
