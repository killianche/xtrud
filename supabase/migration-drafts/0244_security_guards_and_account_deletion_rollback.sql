-- Откат 0244: вернуть delete_my_account к телу до 0244 (md5(prosrc)
-- 1da8c43357fec241f79e74aef983dfbc), снять два триггера-стража, вернуть
-- прежний CHECK order_responses_contact_required (NOT VALID — строки,
-- обезличенные удалением аккаунта, не проверяются), снять CHECK путей
-- паспорта master_verifications_paths_own_folder, удалить очередь файлов.
--
-- Очередь удаляется, только если в ней нет невыполненных заданий: иначе
-- файлы удалённых аккаунтов остались бы без задания на удаление. В этом
-- случае откат останавливается — сначала дождаться сервера или выгрузить
-- задания.
--
-- Данные, уже стёртые новой функцией, откат не возвращает (это и есть цель).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0244_rollback_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.file_deletion_queue') IS NULL THEN
    RAISE EXCEPTION '0244_not_applied';
  END IF;
  IF EXISTS (SELECT 1 FROM xtrud_private.file_deletion_queue WHERE done_at IS NULL) THEN
    RAISE EXCEPTION '0244_rollback_pending_file_deletions';
  END IF;
END $$;

DROP TRIGGER order_responses_counterparty_guard ON public.order_responses;
DROP FUNCTION xtrud_private.guard_order_response_counterparty_update();
DROP TRIGGER master_profiles_moderation_guard ON public.master_profiles;
DROP FUNCTION xtrud_private.guard_master_profile_moderation();

ALTER TABLE public.master_verifications
  DROP CONSTRAINT master_verifications_paths_own_folder;

ALTER TABLE public.order_responses
  DROP CONSTRAINT order_responses_contact_required;
ALTER TABLE public.order_responses
  ADD CONSTRAINT order_responses_contact_required CHECK (
    (NULLIF(btrim(contact_phone), ''::text) IS NOT NULL)
    OR (NULLIF(btrim(whatsapp_phone), ''::text) IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id      uuid := auth.uid();
  v_is_master    boolean;
  v_status       public.user_status;
  v_deleted_at   timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null — must be authenticated';
  END IF;

  SELECT u.is_master, u.status
    INTO v_is_master, v_status
    FROM public.users u
   WHERE u.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user record not found';
  END IF;

  IF v_status = 'deleted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_deleted');
  END IF;

  IF v_is_master THEN
    UPDATE public.order_responses
       SET status = 'withdrawn',
           updated_at = v_deleted_at
     WHERE master_id = v_user_id
       AND status IN ('sent', 'viewed');

    UPDATE public.orders
       SET status = 'cancelled',
           picked_master_id = NULL,
           cancelled_by = v_user_id,
           cancel_reason = 'account_deleted_by_master',
           updated_at = v_deleted_at
     WHERE picked_master_id = v_user_id
       AND status IN ('in_progress', 'awaiting_confirmation');

    DELETE FROM public.master_categories WHERE master_id = v_user_id;
    DELETE FROM public.master_service_areas WHERE master_id = v_user_id;
    DELETE FROM public.master_services WHERE master_id = v_user_id;
    DELETE FROM public.portfolio_items WHERE master_id = v_user_id;

    IF to_regclass('public.portfolio_cases') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.portfolio_cases WHERE master_id = $1' USING v_user_id;
    END IF;

    IF to_regclass('public.master_verifications') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.master_verifications WHERE user_id = $1' USING v_user_id;
    END IF;

    UPDATE public.master_profiles
       SET bio = NULL,
           status = 'archived',
           updated_at = v_deleted_at
     WHERE user_id = v_user_id;
  END IF;

  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_by = v_user_id,
         cancel_reason = 'account_deleted_by_client',
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND status = 'open';

  UPDATE public.orders
     SET status = 'cancelled',
         picked_master_id = NULL,
         cancelled_by = v_user_id,
         cancel_reason = 'account_deleted_by_client',
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND status IN ('in_progress', 'awaiting_confirmation');

  UPDATE public.users
     SET first_name = 'Удалённый пользователь',
         last_name = NULL,
         avatar_url = NULL,
         city_id = NULL,
         district = NULL,
         status = 'deleted',
         rating_as_client_avg = NULL,
         rating_as_client_count = 0,
         updated_at = v_deleted_at
   WHERE id = v_user_id;

  UPDATE public.users_private
     SET phone = NULL,
         birth_year = NULL,
         gender = 'unspecified',
         last_active_at = NULL,
         updated_at = v_deleted_at
   WHERE user_id = v_user_id;

  -- Адрес входа собран из номера (79XXXXXXXXX@phone.xtrud.pro) и уникален:
  -- без обезличивания номер нельзя зарегистрировать заново (0221).
  UPDATE auth.users
     SET email = 'deleted-' || v_user_id::text || '@deleted.xtrud.pro',
         updated_at = v_deleted_at
   WHERE id = v_user_id
     AND lower(email) LIKE '%@phone.xtrud.pro';

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_at', v_deleted_at
  );
END;
$function$;

DROP TABLE xtrud_private.file_deletion_queue;

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'public.delete_my_account()'::regprocedure)
     <> '1da8c43357fec241f79e74aef983dfbc' THEN
    RAISE EXCEPTION '0244_rollback_body_mismatch';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.order_responses'::regclass
         AND conname = 'order_responses_contact_required')
     <> 'CHECK (((NULLIF(btrim(contact_phone), ''''::text) IS NOT NULL) OR (NULLIF(btrim(whatsapp_phone), ''''::text) IS NOT NULL))) NOT VALID' THEN
    RAISE EXCEPTION '0244_rollback_constraint_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_verifications_paths_own_folder') THEN
    RAISE EXCEPTION '0244_rollback_paths_check_left';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
