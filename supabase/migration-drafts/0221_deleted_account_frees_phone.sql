-- 0221: удалённый аккаунт освобождает номер (найдено 2026-10-04, №219–№220).
--
-- delete_my_account обнулял users_private.phone, но адрес входа auth.users.email
-- оставался «79XXXXXXXXX@phone.xtrud.pro» — а он уникален
-- (users_email_partial_key). Человек, удаливший аккаунт, не мог снова
-- зарегистрироваться на свой номер: register_account падал на уникальности, и
-- приложение показывало сырой текст ошибки базы.
--
-- Было: синтетический адрес удалённого аккаунта оставался с номером.
-- Стало: delete_my_account заменяет его на deleted-<id>@deleted.xtrud.pro
--   (вход и так закрыт статусом deleted); уже удалённые аккаунты с пустым
--   номером и синтетическим адресом (2 на 2026-10-04) — так же.
-- Тело функции — живое (pg_get_functiondef 2026-10-04) плюс один UPDATE.
--
-- Откат: 0221_deleted_account_frees_phone_rollback.sql (тело без UPDATE;
-- обезличенные адреса не возвращаются — номера в них уже нет).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0221_must_run_as_postgres';
  END IF;
  IF md5(pg_get_functiondef('public.delete_my_account()'::regprocedure))
     IS DISTINCT FROM 'ae2a4e6f14425d791370f6df4b01830e' THEN
    RAISE EXCEPTION '0221_function_changed';
  END IF;
END;
$$;

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

UPDATE auth.users u
   SET email = 'deleted-' || u.id::text || '@deleted.xtrud.pro', updated_at = now()
  FROM public.users_private up
  JOIN public.users pu ON pu.id = up.user_id
 WHERE up.user_id = u.id
   AND up.phone IS NULL
   AND pu.status = 'deleted'
   AND lower(u.email) LIKE '%@phone.xtrud.pro';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users u
      JOIN public.users_private up ON up.user_id = u.id
      JOIN public.users pu ON pu.id = u.id
     WHERE up.phone IS NULL AND pu.status = 'deleted'
       AND lower(u.email) LIKE '%@phone.xtrud.pro') THEN
    RAISE EXCEPTION '0221_deleted_still_hold_phone';
  END IF;
END;
$$;

COMMIT;
