-- Откат 0217: отклик снова доступен любому вошедшему, флаг open_responses
-- удаляется (какие подкатегории были открыты — в журнале админа и в 0217).
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0217_rollback_must_run_as_postgres';
  END IF;
  -- Откатываем только редакцию 0217: get_app_flags с require_login.
  IF position('require_login' in pg_get_functiondef('public.get_app_flags()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '0217_rollback_flags_not_from_0217';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS order_responses_require_category ON public.order_responses;
DROP FUNCTION IF EXISTS xtrud_private.order_responses_require_category();
DROP FUNCTION IF EXISTS public.can_respond_to_order(uuid);
DROP FUNCTION IF EXISTS xtrud_private.respond_block_category(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_set_category_open_responses(text, boolean, text);
DROP FUNCTION IF EXISTS public.admin_set_require_login(boolean);
DELETE FROM public.app_settings WHERE key = 'require_login';

-- get_app_flags — тело 0216 (без require_login).
CREATE OR REPLACE FUNCTION public.get_app_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'find_screen',
    coalesce((SELECT value->>'variant' FROM public.app_settings WHERE key = 'find_screen'), 'category_first'),
    'find_tiles',
    coalesce((SELECT s.value->>'variant' FROM public.app_settings s
               WHERE s.key = 'find_tiles' AND s.value->>'variant' IN ('mosaic', 'grid')), 'grid')
  );
$$;

-- admin_list_categories — тело 0215 (без open_responses).
DROP FUNCTION IF EXISTS public.admin_list_categories();
CREATE FUNCTION public.admin_list_categories()
 RETURNS TABLE(l1_id text, l1_name text, l2_id text, l2_name text, is_active boolean,
               is_visible boolean, sort_order integer, open_orders integer, masters integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT l1.id, l1.name_ru, l2.id, l2.name_ru, l2.is_active, l2.is_visible, l2.sort_order,
         coalesce(oc.n, 0), coalesce(mc.n, 0)
    FROM public.categories_l2 l2
    JOIN public.categories_l1 l1 ON l1.id = l2.l1_id
    LEFT JOIN (SELECT o.l2_id, count(*)::int AS n FROM public.orders o
                WHERE o.status = 'open' GROUP BY o.l2_id) oc ON oc.l2_id = l2.id
    LEFT JOIN (SELECT m.l2_id, count(DISTINCT m.master_id)::int AS n FROM public.master_categories m
                GROUP BY m.l2_id) mc ON mc.l2_id = l2.id
   ORDER BY l1.sort_order, l1.id, l2.sort_order, l2.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_categories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_categories() TO authenticated, service_role;

ALTER TABLE public.categories_l2 DROP COLUMN IF EXISTS open_responses;

-- Журнал неизменяем: если уже есть записи 'category_open_responses',
-- ограничение не сужается (лишнее значение безвредно).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_actions
                  WHERE action IN ('category_open_responses', 'set_require_login')) THEN
    ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
    ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
      'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show', 'category_hide',
      'set_find_tiles', 'broadcast_push'
    ]::text[]));
  ELSE
    RAISE NOTICE '0217_rollback: journal has 0217 rows, action CHECK kept';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
