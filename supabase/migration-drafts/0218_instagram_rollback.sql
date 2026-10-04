-- Откат 0218: Instagram в профилях и заявки удаляются (одобренные имена —
-- в журнале админа, details.handle).
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0218_rollback_must_run_as_postgres';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_review_instagram(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.admin_list_instagram_requests(text, integer);
DROP FUNCTION IF EXISTS public.my_instagram();
DROP FUNCTION IF EXISTS public.submit_instagram(text);
DROP FUNCTION IF EXISTS xtrud_private.normalize_instagram(text);
DROP TABLE IF EXISTS xtrud_private.instagram_requests;
ALTER TABLE public.master_profiles DROP COLUMN IF EXISTS instagram;

-- admin_attention — тело 0215.
CREATE OR REPLACE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN jsonb_build_object(
    'reports_open',          (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'verifications_pending', (SELECT count(*) FROM public.master_verifications WHERE status = 'pending'),
    'recovery_new',          (SELECT count(*) FROM xtrud_private.recovery_requests WHERE status = 'new'),
    'masters_pending',       (SELECT count(*) FROM public.master_profiles WHERE status = 'pending')
  );
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_actions
                  WHERE action IN ('instagram_approve', 'instagram_reject')) THEN
    ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
    ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
      'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show', 'category_hide',
      'set_find_tiles', 'broadcast_push',
      'category_open_responses', 'set_require_login'
    ]::text[]));
  ELSE
    RAISE NOTICE '0218_rollback: journal has instagram rows, action CHECK kept';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
