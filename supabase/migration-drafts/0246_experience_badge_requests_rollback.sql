-- Откат 0246: заявки на значок «Большой опыт» и push админам о заявках.
-- Значки, выданные по заявкам, остаются (experience_badge_at не трогаем) —
-- снять их можно в админке. Журнал admin_actions только дописывается, поэтому
-- при записях 'experience_badge_reject' откат останавливается: сначала решить
-- с владельцем, что с ними делать.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0246r_must_run_as_postgres';
  END IF;
  IF to_regclass('public.experience_badge_requests') IS NULL THEN
    RAISE EXCEPTION '0246r_not_applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_actions WHERE action = 'experience_badge_reject') THEN
    RAISE EXCEPTION '0246r_reject_actions_exist';
  END IF;
END;
$$;

-- delete_my_account — обратно к телу 0245 (обратные точечные замены).
DO $$
DECLARE
  v_src text;
  v_new text;
  b1 constant text := E'         experience_badge_at = NULL,\n';
  b2 constant text := E'  -- Заявка на значок «Большой опыт» (0246): текст об опыте, WhatsApp.\n' ||
                      E'  DELETE FROM public.experience_badge_requests WHERE user_id = v_user_id;\n';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure;
  IF position(b1 IN v_src) = 0 OR position(b2 IN v_src) = 0 THEN
    RAISE EXCEPTION '0246r_delete_my_account_anchor';
  END IF;
  v_new := replace(replace(v_src, b2, ''), b1, '');
  IF md5(v_new) IS DISTINCT FROM 'a4cf4e35ca1bb95e1d84924bf66c188d' THEN
    RAISE EXCEPTION '0246r_delete_my_account_md5';
  END IF;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS jsonb LANGUAGE plpgsql '
    'SECURITY DEFINER SET search_path TO ''public'', ''pg_temp'' AS %L', v_new);
END;
$$;

DROP TRIGGER company_verifications_notify_admins ON public.company_verifications;
DROP TRIGGER experience_badge_requests_notify_admins ON public.experience_badge_requests;
DROP FUNCTION xtrud_private.notify_admins_badge_request();
DROP FUNCTION public.admin_review_experience_badge_request(uuid, boolean, text, integer);
DROP FUNCTION public.admin_list_experience_badge_requests(text, integer);
DROP FUNCTION public.my_experience_badge_request();
DROP FUNCTION public.submit_experience_badge_request(text, text);
DROP FUNCTION xtrud_private.experience_badge_state(uuid);
DROP TABLE public.experience_badge_requests;

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
    'staff_role_set', 'order_test_mark',
    'company_approve', 'company_reject', 'company_revoke'
  ]::text[]));

DO $$
BEGIN
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conname = 'admin_actions_action_check' AND conrelid = 'public.admin_actions'::regclass)
     IS DISTINCT FROM 'f23016b553eb123e38ebe8e764c010a8' THEN
    RAISE EXCEPTION '0246r_action_check_md5';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
