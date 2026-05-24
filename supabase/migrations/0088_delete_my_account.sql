-- 0088_delete_my_account.sql
-- Sprint 0088 — удаление аккаунта пользователем из приложения (App Store / Google Play требование
-- с 2022/2024). Apple 5.1.1(v), Google Play account deletion policy.
--
-- Подход: soft-delete + анонимизация PII, **не** hard-delete из auth.users.
-- Hard-delete из auth.users поломал бы каскадно chats/messages второй стороны
-- (FK ON DELETE CASCADE) и оставил бы её без истории работы. Apple/Google
-- допускают retention обезличенных данных для safety/legal/dispute purposes —
-- главное чтобы (a) PII удалена, (b) аккаунт нельзя восстановить, (c) операция
-- завершилась немедленно.
--
-- Что делает RPC delete_my_account():
--
--   1. Проверяет что пользователь не уже deleted.
--   2. Если is_master: cancel активные заказы (open / in_progress / awaiting_confirmation)
--      где picked_master_id = auth.uid() с cancel_reason='account_deleted_by_master',
--      обнуляет picked_master_id (constraint orders_picked_only_if_in_progress).
--      Withdraw активные order_responses.
--      DELETE master_categories / master_service_areas / master_services /
--      portfolio_items / portfolio_cases (если есть) / master_verifications.
--      master_profiles: status='archived', bio=NULL (FK CASCADE на public.users
--      сработает только при hard-delete которого мы не делаем).
--   3. Для всех ролей: cancel открытые orders где client_id = auth.uid()
--      с cancel_reason='account_deleted_by_client'. Также cancel in_progress/
--      awaiting_confirmation orders клиента (отписываемся, мастер получит push
--      через cancel triggers если они есть).
--   4. Анонимизация users: first_name='Удалённый пользователь', last_name=NULL,
--      avatar_url=NULL, city_id=NULL, district=NULL, status='deleted',
--      rating_as_client_avg=NULL, rating_as_client_count=0.
--   5. Анонимизация users_private: phone=NULL, birth_year=NULL,
--      gender='unspecified', last_active_at=NULL.
--
-- Что НЕ делает:
--   - Не удаляет auth.users (требует service_role, недоступно из обычной RPC).
--     Клиент после успешного RPC должен вызвать supabase.auth.signOut().
--     phone=NULL в users_private + status='deleted' в users → OTP не сматчит
--     номер с прежним аккаунтом, восстановление невозможно.
--   - Не удаляет reviews (author_id остаётся, но first_name='Удалённый' через
--     users_public view → отзыв виден как «Удалённый пользователь»). Это
--     ценность для второй стороны и других читателей.
--   - Не удаляет messages (та же логика, sender_id остаётся, имя — «Удалённый»).
--   - Не удаляет аватары из Storage. Это batch-задача (cron), не критично для
--     App Store compliance — PII в БД уже нет.
--
-- Возврат: jsonb { ok: true, deleted_at: timestamp }.
-- Все exception'ы → RAISE EXCEPTION (RPC вернёт ошибку клиенту).

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_is_master    boolean;
  v_status       public.user_status;
  v_deleted_at   timestamptz := now();
BEGIN
  -- ---- 1. Аутентификация и идемпотентность ----
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
    -- Идемпотентность: повторный вызов не падает, возвращает ok=false с reason.
    RETURN jsonb_build_object('ok', false, 'reason', 'already_deleted');
  END IF;

  -- ---- 2. Master-specific cleanup ----
  IF v_is_master THEN
    -- 2a. Withdraw активные отклики (sent/viewed) — клиент увидит «отклик отозван».
    UPDATE public.order_responses
       SET status = 'withdrawn',
           updated_at = v_deleted_at
     WHERE master_id = v_user_id
       AND status IN ('sent', 'viewed');

    -- 2b. Cancel заказы где мастер был picked. Constraint требует picked=NULL
    -- при status NOT IN (in_progress, completed) → обнуляем picked в одном UPDATE.
    UPDATE public.orders
       SET status = 'cancelled',
           picked_master_id = NULL,
           cancelled_by = v_user_id,
           cancel_reason = 'account_deleted_by_master',
           updated_at = v_deleted_at
     WHERE picked_master_id = v_user_id
       AND status IN ('in_progress', 'awaiting_confirmation');

    -- 2c. Удаление мастер-данных. master_categories/areas/services FK CASCADE
    -- на master_profiles.user_id, но т.к. master_profiles мы soft-delete (UPDATE),
    -- каскад не сработает — удаляем явно.
    DELETE FROM public.master_categories WHERE master_id = v_user_id;
    DELETE FROM public.master_service_areas WHERE master_id = v_user_id;
    DELETE FROM public.master_services WHERE master_id = v_user_id;

    -- 2d. Портфолио. portfolio_items.master_id FK на users CASCADE, но мы users
    -- не удаляем — явный DELETE. portfolio_cases — опциональная таблица (0085).
    DELETE FROM public.portfolio_items WHERE master_id = v_user_id;

    IF to_regclass('public.portfolio_cases') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.portfolio_cases WHERE master_id = $1' USING v_user_id;
    END IF;

    -- 2e. master_verifications — PII (паспортные сканы). Удаляем запись;
    -- объекты в private Storage bucket master-verifications останутся, их
    -- подчистит отдельный cron (Storage admin API недоступен из RPC).
    IF to_regclass('public.master_verifications') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.master_verifications WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 2f. master_profiles — soft-delete (status='archived'), очистка bio.
    UPDATE public.master_profiles
       SET bio = NULL,
           status = 'archived',
           updated_at = v_deleted_at
     WHERE user_id = v_user_id;
  END IF;

  -- ---- 3. Client-side cleanup (для всех ролей) ----
  -- 3a. Cancel открытые заказы клиента.
  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_by = v_user_id,
         cancel_reason = 'account_deleted_by_client',
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND status = 'open';

  -- 3b. Cancel заказы клиента в работе. picked_master_id уже NOT NULL —
  -- обнуляем в том же UPDATE для соблюдения constraint.
  UPDATE public.orders
     SET status = 'cancelled',
         picked_master_id = NULL,
         cancelled_by = v_user_id,
         cancel_reason = 'account_deleted_by_client',
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND status IN ('in_progress', 'awaiting_confirmation');

  -- ---- 4. Анонимизация PII в users / users_private ----
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

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_at', v_deleted_at
  );
END;
$$;

COMMENT ON FUNCTION public.delete_my_account IS
  'Sprint 0088: удаление аккаунта пользователем (App Store / Google Play требование). Soft-delete users.status=deleted + анонимизация PII, cancel активных заказов с обеих сторон, DELETE мастер-данных (categories/areas/services/portfolio/verifications). Auth.users остаётся (нет admin permissions из RPC) — но phone=NULL делает восстановление невозможным. После успешного вызова клиент должен supabase.auth.signOut().';

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
