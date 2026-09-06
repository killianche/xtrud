-- 0166: снять с API-ролей табличные привилегии, которые RLS не ограничивает.
--
-- FACT (live Beget, 2026-09-06): на 25 таблицах public у anon и authenticated
-- остались дефолтные гранты Supabase — TRUNCATE, REFERENCES, TRIGGER, а у anon
-- ещё INSERT/UPDATE/DELETE. RLS ограничивает только строки при SELECT/INSERT/
-- UPDATE/DELETE; TRUNCATE, REFERENCES и TRIGGER она не трогает вовсе.
-- Через PostgREST эти команды недостижимы, но держать их у публичной роли —
-- заряженное ружьё на случай любой другой точки входа (см. 0135, 0145 —
-- там то же самое закрыто для users, master_profiles, orders,
-- order_responses, reviews).
--
-- Что делаем:
--   1. TRUNCATE, REFERENCES, TRIGGER — снять с anon и authenticated со всех
--      таблиц public.
--   2. INSERT, UPDATE, DELETE — снять с anon со всех таблиц public, кроме
--      client_errors: туда приложение пишет отчёты об ошибках до входа
--      (политика client_errors_insert_any для anon, src/lib/error-reporting.ts).
--   3. app_secrets — anon и authenticated не имеют там дела вовсе (RLS без
--      политик и так закрывает, но гранты снимаем).
--   4. order_broadcast_queue — уже закрыта в 0163, здесь не трогаем.
-- authenticated сохраняет INSERT/UPDATE/DELETE: на них опираются политики
-- «своя строка». Колоночные ограничения других таблиц — отдельная задача.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t.tablename);
    IF t.tablename <> 'client_errors' THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t.tablename);
    ELSE
      EXECUTE format('REVOKE UPDATE, DELETE ON public.%I FROM anon', t.tablename);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON public.app_secrets FROM anon, authenticated;

-- Проверка (ожидается 0 строк):
--   SELECT table_name, grantee, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND grantee IN ('anon','authenticated')
--      AND (privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
--           OR (grantee='anon' AND privilege_type IN ('UPDATE','DELETE'))
--           OR (grantee='anon' AND privilege_type='INSERT' AND table_name<>'client_errors'));

-- ===========================================================================
-- Часть 2. Функции: кто может вызывать через /rpc.
-- ===========================================================================
--
-- FACT (live Beget, 2026-09-06):
--   * notify_user(uuid,text,text,jsonb) — SECURITY DEFINER, EXECUTE у anon и
--     authenticated. Любой ключ приложения мог создать уведомление любому
--     пользователю с любым текстом (и отправить push, когда push включат).
--   * get_master_phone(uuid) — SECURITY DEFINER без проверки auth.uid(),
--     EXECUTE у anon. Оставлено как есть: гость звонит мастеру напрямую
--     с экрана профиля (DECISION владельца 2026-05-20 «classifieds»).
--     Менять — только словом владельца.
--   * expire_old_orders, auto_confirm_completions, cancel_stale_in_progress,
--     expire_availability, recalc_master_rating, recompute_master_ranking_scores
--     — ночные задачи pg_cron, EXECUTE у anon и authenticated: любой мог
--     запускать их когда угодно.
--   * withdraw_response — SECURITY INVOKER и зовёт notify_user; после снятия
--     EXECUTE у authenticated сломался бы. У функции есть явная проверка
--     владельца отклика (v_master_id != auth.uid() → 42501), поэтому её
--     безопасно перевести в SECURITY DEFINER, как остальные функции жизненного
--     цикла (confirm_completion, reopen_order, terminate_cooperation).

ALTER FUNCTION public.withdraw_response(uuid) SECURITY DEFINER;

-- Служебные и внутренние: только владелец (postgres, cron, триггеры,
-- SECURITY DEFINER-функции) и service_role.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.notify_user(uuid,text,text,jsonb)',
    'public.expire_old_orders()',
    'public.auto_confirm_completions()',
    'public.cancel_stale_in_progress()',
    'public.expire_availability()',
    'public.recalc_master_rating()',
    'public.recompute_master_ranking_scores()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- Действия, которым нужен вход: anon не вызывает их вовсе. Клиент зовёт их
-- только ролью authenticated (после входа), гостевые экраны их не трогают —
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.count_common_contacts_with(uuid)',
    'public.get_response_limit_today()',
    'public.delete_my_account()',
    'public.enable_master_mode()',
    'public.set_username(text)',
    'public.set_master_service_areas(text[],text[])',
    'public.set_availability(public.availability_status)',
    'public.submit_master_review(uuid,integer,text)',
    'public.confirm_completion(uuid)',
    'public.confirm_work_done(uuid,uuid,text,text,integer,text)',
    'public.mark_order_done(uuid)',
    'public.reject_response(uuid)',
    'public.reopen_order(uuid)',
    'public.terminate_cooperation(uuid,text)',
    'public.touch_last_active()',
    'public.try_publish_master(uuid)',
    'public.withdraw_response(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- Проверка (ожидается false для всех):
--   SELECT proname, has_function_privilege('anon', oid, 'EXECUTE')
--     FROM pg_proc WHERE pronamespace='public'::regnamespace
--      AND proname IN ('notify_user','expire_old_orders','delete_my_account');
--   SELECT has_function_privilege('authenticated','public.notify_user(uuid,text,text,jsonb)','EXECUTE');

-- ===========================================================================
-- Часть 3. Последовательности: anon не пишет напрямую.
-- ===========================================================================
-- search_queries_log_id_seq: запись идёт через SECURITY DEFINER log_search_query,
-- прямой доступ anon к последовательности не нужен. Дефолт для новых
-- последовательностей, создаваемых ролью postgres, — тоже без anon.
-- (Дефолт роли supabase_admin здесь не трогаем: у postgres нет на это прав.)
REVOKE ALL ON SEQUENCE public.search_queries_log_id_seq FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
