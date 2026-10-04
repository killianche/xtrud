-- Откат 0215: функции админки «пульт / задания / отзывы / категории».
--
-- Данные не трогаются: задания, возвращённые admin_restore_order, остаются
-- открытыми; скрытые/показанные отзывы и категории сохраняют текущий флаг
-- (вернуть — по журналу admin_actions, действия restore_order, hide/unhide
-- с target_type='review', category_show/category_hide).
--
-- Журнал неизменяем (admin_actions_append_only). Если в нём уже есть записи с
-- новыми значениями, ограничения не сужаются обратно — лишнее значение
-- безвредно (как в 0214). Если записей нет — ограничения возвращаются к
-- живому списку до 0215.
--
-- Порядок: сначала убрать новые имена из server/src/rpc/routes.ts
-- RPC_ALLOWLIST и выложить xtrud-api/админку без вызовов, затем этот файл.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0215_rollback_must_run_as_postgres';
  END IF;
  -- Откатываем только редакцию 0215: если позже 0216+ расширили списки,
  -- откат их не трогает (ревью xtrud-security 2026-10-04, F3).
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conname = 'admin_actions_action_check') <> '4cc6940e395b148e3ff689b9102a09a3'
     OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conname = 'admin_actions_target_type_check') <> '55147bfd4ed8310cecd9e0ac86e98e69' THEN
    RAISE EXCEPTION '0215_rollback_constraints_not_from_0215';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_set_category_visible(text, boolean, text);
DROP FUNCTION IF EXISTS public.admin_list_categories();
DROP FUNCTION IF EXISTS public.admin_set_review_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_list_reviews(text, integer, integer);
DROP FUNCTION IF EXISTS public.admin_restore_order(uuid, text);
DROP FUNCTION IF EXISTS public.admin_order_card(uuid);
DROP FUNCTION IF EXISTS public.admin_list_orders(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.admin_metrics_series(integer);
DROP FUNCTION IF EXISTS public.admin_attention();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_actions
                  WHERE action IN ('restore_order', 'category_show', 'category_hide')) THEN
    ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
    ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
      'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request'
    ]::text[]));
  ELSE
    RAISE NOTICE '0215_rollback: admin_actions has new actions, action CHECK kept';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_actions WHERE target_type = 'category') THEN
    ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_target_type_check;
    ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_target_type_check CHECK (target_type = ANY (ARRAY[
      'user', 'order', 'order_response', 'review', 'report', 'storage_object', 'settings', 'promo_banner'
    ]::text[]));
  ELSE
    RAISE NOTICE '0215_rollback: admin_actions has category rows, target_type CHECK kept';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
