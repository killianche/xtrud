-- 0223: справочник городов — только чтение для ролей API (ревью xtrud-security
-- 0212, Low-3, 2026-10-05; владелец: «исправь ошибки»).
--
-- Было: cities — authenticated=arwdm (запись закрывало только отсутствие
--   политик RLS: появись политика FOR ALL — любой вошедший переименовал бы
--   город); anon — лишний MAINTAIN на cities, orders, master_service_areas.
-- Стало: cities — authenticated и anon только SELECT; MAINTAIN у anon снят.
--   Приложение в cities не пишет (только select). Справочник меняют миграции.
--
-- Откат: 0223_cities_write_closed_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0223_must_run_as_postgres';
  END IF;
END;
$$;

REVOKE INSERT, UPDATE, DELETE, MAINTAIN ON public.cities FROM authenticated;
REVOKE MAINTAIN ON public.cities, public.orders, public.master_service_areas FROM anon;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.cities', 'INSERT')
     OR has_table_privilege('authenticated', 'public.cities', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.cities', 'DELETE')
     OR has_table_privilege('anon', 'public.orders', 'MAINTAIN') THEN
    RAISE EXCEPTION '0223_still_granted';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.cities', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.cities', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.master_service_areas', 'INSERT') THEN
    RAISE EXCEPTION '0223_lost_needed_access';
  END IF;
END;
$$;

COMMIT;
