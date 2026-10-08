-- Откат 0243 (аналитика админки, №299).
--
-- Порядок: СНАЧАЛА убрать вызовы из веб-админки (admin_analytics_*,
-- admin_set_order_test) и серверный allowlist; приложение, которое зовёт
-- track_event, после отката получит 404/42883 — вызов в клиенте обязан быть
-- «выстрелил и забыл» (ошибка не показывается). Затем этот файл.
--
-- Что делает:
--   * touch_last_active, mark_order_responses_viewed — тела до 0243 (живые
--     2026-10-08) целиком; предусловие — md5 редакции 0243 (снято на
--     репетиции 2026-10-08); результат сверяется по md5 с живым телом до
--     0243 (откат точный). mark_order_responses_viewed снова SECURITY
--     INVOKER, EXECUTE у PUBLIC и anon возвращается (как было);
--   * pg_cron: снимается задача nightly_prune_analytics_events;
--   * DROP admin_analytics_overview/_orders/_masters/_clients/_daily,
--     admin_set_order_test, track_event,
--     xtrud_private.analytics_excluded_order/_user, таблица
--     analytics_events (события теряются — в этом смысл отката);
--   * DROP COLUMN order_responses.viewed_at и orders.is_test (отметки
--     «тестовое» теряются; журнал admin_actions хранит order_test_mark);
--   * admin_actions_action_check возвращается к редакции до 0243, только
--     если в журнале нет строк order_test_mark; иначе остаётся в редакции
--     0243 (журнал append-only, как в откате 0239).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0243_rollback_must_run_as_postgres';
  END IF;
  IF to_regclass('public.analytics_events') IS NULL
     OR to_regprocedure('public.track_event(text,uuid,uuid,uuid,text,text,integer)') IS NULL THEN
    RAISE EXCEPTION '0243_not_applied';
  END IF;
  IF md5(pg_get_functiondef('public.touch_last_active()'::regprocedure))
       IS DISTINCT FROM 'cecf3daff6066e97710d6129cd5077a8'
     OR md5(pg_get_functiondef('public.mark_order_responses_viewed(uuid)'::regprocedure))
       IS DISTINCT FROM '905516d2c57619e96baef0c0dc969f98' THEN
    RAISE EXCEPTION '0243_rollback_function_changed_after_0243';
  END IF;
END $$;

-- 1. Тела до 0243.
CREATE OR REPLACE FUNCTION public.touch_last_active()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.users set last_active_at = now() where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_responses_viewed(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND client_id = (SELECT auth.uid())
  ) THEN
    RETURN;
  END IF;

  UPDATE public.order_responses
    SET status = 'viewed'
    WHERE order_id = p_order_id AND status = 'sent';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_order_responses_viewed(uuid) TO PUBLIC, anon;

-- 2. Задача pg_cron.
SELECT cron.unschedule('nightly_prune_analytics_events')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly_prune_analytics_events');

-- 3. Новые функции и таблица.
DROP FUNCTION public.admin_analytics_overview(integer);
DROP FUNCTION public.admin_analytics_orders(integer, integer, integer, text);
DROP FUNCTION public.admin_analytics_masters(integer, integer, integer, text, text);
DROP FUNCTION public.admin_analytics_clients(integer, integer, integer, text, text);
DROP FUNCTION public.admin_analytics_daily(integer);
DROP FUNCTION public.admin_set_order_test(uuid, boolean, text);
DROP FUNCTION public.track_event(text, uuid, uuid, uuid, text, text, integer);
DROP FUNCTION xtrud_private.analytics_excluded_order(uuid);
DROP FUNCTION xtrud_private.analytics_excluded_user(uuid);
DROP TABLE public.analytics_events;

-- 4. Столбцы.
ALTER TABLE public.order_responses DROP COLUMN viewed_at;
ALTER TABLE public.orders DROP COLUMN is_test;

-- 5. Ограничение журнала — только если order_test_mark ещё не использовался.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_actions WHERE action = 'order_test_mark') THEN
    RAISE NOTICE '0243_rollback: admin_actions_action_check остаётся в редакции 0243 (есть строки order_test_mark)';
    RETURN;
  END IF;
  ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
  ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
    CHECK (action = ANY (ARRAY[
      'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order',
      'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve',
      'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone',
      'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update',
      'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show',
      'category_hide', 'set_find_tiles', 'broadcast_push', 'category_open_responses',
      'set_require_login', 'instagram_approve', 'instagram_reject', 'experience_badge_grant',
      'experience_badge_revoke', 'set_composer_start', 'set_composer_form',
      'order_set_category', 'category_create', 'order_shadow_hide', 'order_shadow_unhide',
      'category_update', 'category_merge', 'section_rename', 'catalog_reorder',
      'staff_role_set'
    ]::text[]));
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM 'a0c72c53628c9ab88fa1b4fa59d77291' THEN
    RAISE EXCEPTION '0243_rollback_constraint_not_exact';
  END IF;
END $$;

-- Постпроверки: тела и права — как до 0243.
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.touch_last_active()'::regprocedure))
       IS DISTINCT FROM '14dc08203844d71274cd19f543609be2'
     OR md5(pg_get_functiondef('public.mark_order_responses_viewed(uuid)'::regprocedure))
       IS DISTINCT FROM '6d2b29b987a04ecbfdc0ff1e2d772c2a' THEN
    RAISE EXCEPTION '0243_rollback_body_not_exact';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.mark_order_responses_viewed(uuid)'::regprocedure)
     OR NOT has_function_privilege('anon', 'public.mark_order_responses_viewed(uuid)', 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                     WHERE p.oid = 'public.mark_order_responses_viewed(uuid)'::regprocedure
                       AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION '0243_rollback_acl_not_exact';
  END IF;
  IF to_regclass('public.analytics_events') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND ((table_name = 'orders' AND column_name = 'is_test')
                     OR (table_name = 'order_responses' AND column_name = 'viewed_at')))
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly_prune_analytics_events')
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE (n.nspname = 'public' AND (p.proname LIKE 'admin\_analytics\_%'
                          OR p.proname IN ('track_event', 'admin_set_order_test')))
                    OR (n.nspname = 'xtrud_private' AND p.proname LIKE 'analytics\_excluded\_%')) THEN
    RAISE EXCEPTION '0243_rollback_leftovers';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
