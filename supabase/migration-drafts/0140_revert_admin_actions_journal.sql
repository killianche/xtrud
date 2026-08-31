-- ЧЕРНОВИК ОТКАТА для 0139_admin_actions_journal.sql.
--
-- Откат удаляет журнал целиком. Поэтому он ОТКАЗЫВАЕТСЯ работать, пока в
-- журнале есть хоть одна запись: единственный смысл этой таблицы — отвечать
-- на вопрос «кто это сделал», и молчаливое уничтожение ответа откатом ничем
-- не лучше отсутствия журнала.
--
-- Если записи нужно убрать осознанно, их сначала выгружают за пределы базы:
--
--   \copy (SELECT * FROM public.admin_actions ORDER BY performed_at)
--     TO 'admin_actions_<дата>.csv' WITH (FORMAT csv, HEADER)
--
-- и только потом удаляют таблицу вручную. Черновик этого за оператора не
-- делает и не предлагает флага «всё равно удалить»: такой флаг всегда
-- оказывается нажат.

\set ON_ERROR_STOP on

DO $revert$
DECLARE
  v_rows bigint;
  v_refs text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'admin_actions_revert_requires_database_owner'
      USING DETAIL = format('current_user = %L', current_user);
  END IF;

  IF to_regclass('public.admin_actions') IS NULL THEN
    RAISE NOTICE 'admin_actions_revert: журнала нет, откат уже выполнен.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.admin_actions' INTO v_rows;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'admin_actions_revert_would_destroy_history'
      USING DETAIL = format('в журнале %s записей', v_rows),
            HINT = 'Сначала выгрузить журнал за пределы базы, затем удалять вручную. Автоматического уничтожения истории здесь нет намеренно.';
  END IF;

  -- Никто не должен остаться со ссылкой на удаляемую функцию записи.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_refs
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname NOT IN ('admin_log_action', 'admin_actions_append_only')
     AND p.prosrc LIKE '%admin_log_action%';

  IF v_refs IS NOT NULL THEN
    RAISE EXCEPTION 'admin_actions_revert_still_referenced'
      USING DETAIL = format('функции, вызывающие admin_log_action: %s', v_refs),
            HINT = 'Сначала откатить RPC шага 2, потом журнал.';
  END IF;

  DROP FUNCTION IF EXISTS public.admin_log_action(text, text, uuid, text, uuid, jsonb, uuid);
  DROP TABLE public.admin_actions;                       -- триггеры и политика уходят вместе с ней
  DROP FUNCTION IF EXISTS public.admin_actions_append_only();

  RAISE NOTICE 'admin_actions_revert: пустой журнал и его функции удалены.';
END
$revert$;

-- Сверка: 0139 не должна оставить ни одного объекта.
DO $verify$
BEGIN
  IF to_regclass('public.admin_actions') IS NOT NULL THEN
    RAISE EXCEPTION 'admin_actions_revert_table_survived';
  END IF;
  IF to_regproc('public.admin_actions_append_only') IS NOT NULL THEN
    RAISE EXCEPTION 'admin_actions_revert_trigger_function_survived';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'admin_log_action') THEN
    RAISE EXCEPTION 'admin_actions_revert_rpc_survived';
  END IF;
  RAISE NOTICE 'admin_actions_revert: объектов 0139 не осталось.';
END
$verify$;
