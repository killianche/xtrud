-- Migration 0024 — pg_cron job для автоматического перевода старых open-заказов
-- в статус 'expired'. Закрытие T7 из docs/order-states.md.
--
-- Контракт:
--  Каждую ночь в 03:00 (UTC; Supabase region eu-central-1) ищем все orders
--  со status='open' и expires_at < now() и переводим в 'expired'. Это убирает
--  висящие заказы из master feed, которые клиент бросил.
--
-- Почему именно так:
--  - UPDATE минимально-разрушительный, RLS не блокирует (cron работает от
--    суперюзера, не от auth.uid).
--  - Триггеры на orders (если будут) на UPDATE OF status сработают и
--    породят side effects (notifications). На 2026-05 таких триггеров нет —
--    тихая смена статуса.
--  - 03:00 UTC = 06:00 МСК — низкая нагрузка, мастера ещё не открыли приложение.
--
-- Откат: см. cron.unschedule в конце файла как guide.

-- ============================================================================
-- 1. Установка pg_cron extension (Supabase ставит в схему `extensions`).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- pg_cron работает в схеме `cron` (создаётся автоматически). Проверяем
-- что схема существует — без неё cron.schedule() ниже упадёт.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE EXCEPTION 'pg_cron extension installed but cron schema missing';
  END IF;
END
$$;

-- ============================================================================
-- 2. SQL-функция, которую дёргает cron. Выделена отдельно, чтобы её можно
--    было дёрнуть вручную для тестов: `SELECT public.expire_old_orders();`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_old_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected int;
BEGIN
  UPDATE public.orders
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'open'
      AND expires_at < now();

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION public.expire_old_orders IS
  'Sprint 23: переводит open-заказы с истёкшим expires_at в статус expired. Дёргается nightly из pg_cron + можно вызвать вручную для тестов.';

REVOKE EXECUTE ON FUNCTION public.expire_old_orders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_old_orders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_old_orders() FROM authenticated;
-- Только postgres (cron worker) и service_role могут дёрнуть.

-- ============================================================================
-- 3. Cron job: каждую ночь 03:00 UTC.
--    UNSCHEDULE если уже существует с тем же job_name (идемпотентность).
-- ============================================================================

DO $$
DECLARE
  v_existing_jobid bigint;
BEGIN
  SELECT jobid INTO v_existing_jobid
  FROM cron.job
  WHERE jobname = 'nightly_expire_orders';

  IF v_existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_jobid);
  END IF;
END
$$;

SELECT cron.schedule(
  'nightly_expire_orders',
  '0 3 * * *',
  $cron$SELECT public.expire_old_orders();$cron$
);

-- ============================================================================
-- Откат (для документации, не выполняется здесь):
--   SELECT cron.unschedule('nightly_expire_orders');
--   DROP FUNCTION public.expire_old_orders();
--   -- DROP EXTENSION pg_cron;  -- осторожно, если другие job'ы зависят
-- ============================================================================
