-- 0244: три дыры из аудита безопасности (№304, docs/AUDIT_2026-10-07.md §7, п. 3–5).
--
-- DECISION владельца 2026-10-08: «сделать так, чтобы это невозможно было».
--
-- 1. Заказчик переписывал чужой отклик (FACT, снимок 2026-10-08):
--    политика order_responses_update_own_or_client пускает в UPDATE и автора
--    (master_id), и автора задания; колоночный грант authenticated на UPDATE —
--    contact_phone, lead_time, message, price_kind, price_value, status,
--    whatsapp_phone. Значит заказчик мог сменить текст, цену и телефоны в
--    отклике специалиста. Стало: триггер order_responses_counterparty_guard —
--    не автор отклика меняет только status и только sent→viewed или
--    sent|viewed→rejected; остальные колонки обязаны остаться прежними.
--    Пути приложения: mark_order_responses_viewed (INVOKER, sent→viewed) —
--    работает; reject_response, withdraw_response, pick/unpick/reopen и т.п. —
--    SECURITY DEFINER от postgres, триггер их пропускает; правка отклика
--    автором (submit_order_response, INVOKER) — пропускается. Автор меняет
--    статус только sent|viewed→withdrawn и withdrawn→sent: обход отказа
--    rejected→withdrawn→sent (с повторным push заказчику) закрыт (ревью, W1).
--    Пути паспорта/селфи — только в папке <user_id>/ (CHECK, ревью B1/W2).
--    accept_response (INVOKER) ставит accepted и уже сейчас падает на
--    guard_order_lifecycle_direct_update при смене статуса задания —
--    теперь упадёт раньше, на этом триггере; рабочего пути не было и нет.
--
-- 2. Скрытый админом специалист возвращал себя в каталог (FACT):
--    admin_set_master_visibility ставит status='suspended',
--    is_hidden_from_search=true; грант authenticated на UPDATE включает status
--    и is_hidden_from_search, политика master_profiles_update_own пускает
--    владельца. Клиент (use-finalize-master-onboarding.ts) сам пишет
--    status='active' — тем же запросом скрытый специалист выходил из
--    suspended. Стало: триггер master_profiles_moderation_guard — кроме
--    владельца базы (и SECURITY DEFINER-функций от него) никто не выводит
--    профиль из suspended/archived, не ставит suspended/archived и не снимает
--    is_hidden_from_search у профиля в suspended. Колонки не отзываются:
--    своё скрытие (use-master-privacy.ts) и draft/pending/active работают.
--
-- 3. Удаление аккаунта стирало данные не полностью (FACT, живое тело
--    delete_my_account, md5(prosrc) 1da8c43357fec241f79e74aef983dfbc):
--    оставались users.contact_phone/username, телефоны, Instagram и ссылка
--    специалиста, контакты/адрес/фото в заданиях, контакты и текст откликов,
--    auth.identities, пароль, телефон и не-«телефонный» email в auth.users,
--    паспорт у не-специалиста. Стало: функция дочищает всё перечисленное
--    (плюс ИНН/ОГРН/юр. имя, push-токены, контакты, заявки Instagram,
--    телефон в заявках на восстановление), обнуляет actor_id/master_id в
--    public.analytics_events, если таблица есть (0243), и ставит файлы в
--    очередь xtrud_private.file_deletion_queue — удаляет их сервер.
--    Ответ функции не меняется: {ok:true, deleted_at} | {ok:false, reason}.
--
--    Чтобы обнулить контакты в отклике, CHECK order_responses_contact_required
--    (NOT VALID) сужен: контакт обязателен у живого отклика (sent/viewed);
--    у withdrawn/rejected/accepted допускаются пустые контакты. Удаление
--    аккаунта сначала переводит sent/viewed в withdrawn (как и раньше).
--
-- Откат: 0244_security_guards_and_account_deletion_rollback.sql.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0244_must_run_as_postgres';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'public.delete_my_account()'::regprocedure)
     <> '1da8c43357fec241f79e74aef983dfbc' THEN
    RAISE EXCEPTION '0244_delete_my_account_drifted';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.order_responses'::regclass
         AND conname = 'order_responses_contact_required')
     <> 'CHECK (((NULLIF(btrim(contact_phone), ''''::text) IS NOT NULL) OR (NULLIF(btrim(whatsapp_phone), ''''::text) IS NOT NULL))) NOT VALID' THEN
    RAISE EXCEPTION '0244_contact_required_drifted';
  END IF;
  IF to_regclass('xtrud_private.file_deletion_queue') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'master_verifications_paths_own_folder')
     OR to_regprocedure('xtrud_private.guard_order_response_counterparty_update()') IS NOT NULL
     OR to_regprocedure('xtrud_private.guard_master_profile_moderation()') IS NOT NULL THEN
    RAISE EXCEPTION '0244_already_applied';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Отклик меняет только его автор.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.guard_order_response_counterparty_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Владелец базы и SECURITY DEFINER-функции от него (reject_response,
  -- withdraw_response, pick/unpick/reopen, delete_my_account …).
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Автор отклика: содержимое — по грантам, RLS и прежним триггерам;
  -- статус — только отозвать живой (sent|viewed → withdrawn) и отправить
  -- отозванный заново (withdrawn → sent, это делает submit_order_response,
  -- INVOKER). Решение заказчика (rejected, accepted) автор не меняет: иначе
  -- rejected → withdrawn → sent возвращал отклик и слал повторный push.
  IF (SELECT auth.uid()) IS NOT DISTINCT FROM OLD.master_id
     AND NEW.master_id IS NOT DISTINCT FROM OLD.master_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status IN ('sent', 'viewed') AND NEW.status = 'withdrawn')
      OR (OLD.status = 'withdrawn' AND NEW.status = 'sent')
    ) THEN
      RAISE EXCEPTION 'Решение по отклику уже принято, изменить его нельзя.'
        USING ERRCODE = '42501', DETAIL = 'order_response_author_status';
    END IF;
    RETURN NEW;
  END IF;

  -- Не автор (заказчик): содержимое отклика неизменно.
  IF (to_jsonb(NEW) - 'status' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Отклик может изменить только его автор.'
      USING ERRCODE = '42501', DETAIL = 'order_response_author_only';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'sent' AND NEW.status = 'viewed')
    OR (OLD.status IN ('sent', 'viewed') AND NEW.status = 'rejected')
  ) THEN
    RAISE EXCEPTION 'Этот статус отклика так поменять нельзя.'
      USING ERRCODE = '42501', DETAIL = 'order_response_status_transition';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER order_responses_counterparty_guard
  BEFORE UPDATE ON public.order_responses
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.guard_order_response_counterparty_update();

-- ---------------------------------------------------------------------------
-- 2. Скрытие модератором снимает только модератор.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.guard_master_profile_moderation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Владелец базы и SECURITY DEFINER-функции от него
  -- (admin_set_master_visibility, try_publish_master, delete_my_account …).
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('suspended', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Профиль скрыт модератором. Напишите в поддержку.'
      USING ERRCODE = '42501', DETAIL = 'master_status_moderated';
  END IF;

  IF NEW.status IN ('suspended', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Этот статус профиля ставит только модератор.'
      USING ERRCODE = '42501', DETAIL = 'master_status_moderator_only';
  END IF;

  IF OLD.status = 'suspended'
     AND OLD.is_hidden_from_search IS DISTINCT FROM NEW.is_hidden_from_search
     AND NEW.is_hidden_from_search IS NOT TRUE THEN
    RAISE EXCEPTION 'Профиль скрыт модератором. Напишите в поддержку.'
      USING ERRCODE = '42501', DETAIL = 'master_hidden_by_moderator';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER master_profiles_moderation_guard
  BEFORE UPDATE ON public.master_profiles
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.guard_master_profile_moderation();

-- ---------------------------------------------------------------------------
-- 3. Очередь удаления файлов и полное удаление аккаунта.
-- ---------------------------------------------------------------------------
-- Файлы лежат в <bucket>/<userId>/… (server/src/files/routes.ts требует
-- parts[0] = sub при загрузке), поэтому достаточно префикса папки
-- пользователя. Точных путей вне папки в очереди не бывает: путь в строке
-- задаёт клиент, и так можно было бы удалить чужой файл (ревью 2026-10-08, B1).
CREATE TABLE xtrud_private.file_deletion_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  bucket text NOT NULL
    CHECK (bucket IN ('avatars', 'portfolio', 'order-photos', 'master-verifications')),
  object_path text NOT NULL
    CHECK (object_path ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/?$'
           AND object_path !~ '(^|/)\.\.?(/|$)'),
  is_prefix boolean NOT NULL DEFAULT false,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 500),
  CONSTRAINT file_deletion_queue_prefix_shape
    CHECK (is_prefix = (right(object_path, 1) = '/')),
  CONSTRAINT file_deletion_queue_unique UNIQUE (bucket, object_path)
);
CREATE INDEX file_deletion_queue_pending_idx
  ON xtrud_private.file_deletion_queue (enqueued_at) WHERE done_at IS NULL;

REVOKE ALL ON xtrud_private.file_deletion_queue FROM PUBLIC, anon, authenticated;
-- Сервер (asService, роль xtrud_api) забирает задания и отмечает результат.
GRANT SELECT ON xtrud_private.file_deletion_queue TO xtrud_api;
GRANT UPDATE (done_at, attempts, last_error)
  ON xtrud_private.file_deletion_queue TO xtrud_api;

-- Пути паспорта и селфи — только в своей папке <user_id>/ (как требует
-- загрузка, server/src/files/routes.ts). Без этого можно было подать на
-- проверку чужой паспорт или (через удаление аккаунта) поставить его в
-- очередь удаления. Живые строки соответствуют (снимок 2026-10-08: 0 из 1
-- нарушений), поэтому ограничение сразу проверяется (VALIDATE): при дрейфе
-- миграция откатится целиком.
ALTER TABLE public.master_verifications
  ADD CONSTRAINT master_verifications_paths_own_folder CHECK (
    (passport_main_path IS NULL OR left(passport_main_path, 37) = user_id::text || '/')
    AND (selfie_path IS NULL OR left(selfie_path, 37) = user_id::text || '/')
  ) NOT VALID;
ALTER TABLE public.master_verifications
  VALIDATE CONSTRAINT master_verifications_paths_own_folder;

ALTER TABLE public.order_responses
  DROP CONSTRAINT order_responses_contact_required;
ALTER TABLE public.order_responses
  ADD CONSTRAINT order_responses_contact_required CHECK (
    status NOT IN ('sent', 'viewed')
    OR NULLIF(btrim(contact_phone), '') IS NOT NULL
    OR NULLIF(btrim(whatsapp_phone), '') IS NOT NULL
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
  v_column       text;
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

  -- Файлы: задания для сервера ставятся до обнуления ссылок.
  INSERT INTO xtrud_private.file_deletion_queue (user_id, bucket, object_path, is_prefix)
  SELECT v_user_id, b.bucket, v_user_id::text || '/', true
    FROM (VALUES ('avatars'), ('portfolio'), ('order-photos'), ('master-verifications')) AS b(bucket)
  ON CONFLICT (bucket, object_path) DO NOTHING;

  -- Отклики: живые — отозвать (как раньше), затем стереть контакты и текст во всех.
  UPDATE public.order_responses
     SET status = 'withdrawn',
         updated_at = v_deleted_at
   WHERE master_id = v_user_id
     AND status IN ('sent', 'viewed');

  UPDATE public.order_responses
     SET contact_phone = NULL,
         whatsapp_phone = NULL,
         message = NULL,
         updated_at = v_deleted_at
   WHERE master_id = v_user_id
     AND (contact_phone IS NOT NULL OR whatsapp_phone IS NOT NULL OR message IS NOT NULL);

  IF v_is_master THEN
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
  END IF;

  -- Работы и паспорт — у любого аккаунта, а не только у текущего специалиста.
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
         is_hidden_from_search = true,
         whatsapp_phone = NULL,
         whatsapp_same_as_phone = false,
         instagram = NULL,
         link_url = NULL,
         inn = NULL,
         ogrn = NULL,
         legal_name = NULL,
         updated_at = v_deleted_at
   WHERE user_id = v_user_id;

  -- Задания: живые — отменить (как раньше), затем стереть контакты, адрес и фото во всех.
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

  -- phone_open без телефона нарушает orders_contact_mode_consistency;
  -- chat_only — честное состояние «связи по телефону нет».
  UPDATE public.orders
     SET contact_mode = CASE WHEN contact_mode = 'phone_open'
                             THEN 'chat_only'::public.order_contact_mode
                             ELSE contact_mode END,
         contact_phone = NULL,
         whatsapp_phone = NULL,
         contact_name = NULL,
         address = NULL,
         photo_urls = '{}'::text[],
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND (contact_phone IS NOT NULL OR whatsapp_phone IS NOT NULL
          OR contact_name IS NOT NULL OR address IS NOT NULL
          OR cardinality(photo_urls) > 0);

  -- Прочие персональные следы.
  DELETE FROM public.notification_tokens WHERE user_id = v_user_id;
  DELETE FROM public.user_contacts WHERE user_id = v_user_id;
  IF to_regclass('xtrud_private.instagram_requests') IS NOT NULL THEN
    EXECUTE 'DELETE FROM xtrud_private.instagram_requests WHERE user_id = $1' USING v_user_id;
  END IF;
  IF to_regclass('xtrud_private.recovery_requests') IS NOT NULL THEN
    -- phone NOT NULL с проверкой длины 10..20: заменяем обезличенной меткой.
    EXECUTE $q$
      UPDATE xtrud_private.recovery_requests
         SET phone = '0000000000', note = NULL
       WHERE user_id = $1
    $q$ USING v_user_id;
  END IF;

  -- Аналитика (0243): только колонки, которые реально есть.
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    FOREACH v_column IN ARRAY ARRAY['actor_id', 'master_id'] LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'analytics_events'
           AND column_name = v_column
      ) THEN
        EXECUTE format('UPDATE public.analytics_events SET %1$I = NULL WHERE %1$I = $1', v_column)
          USING v_user_id;
      END IF;
    END LOOP;
  END IF;

  -- Статус deleted — последним: guard_content_author_active пропускает правки
  -- контента только от активного аккаунта.
  UPDATE public.users
     SET first_name = 'Удалённый пользователь',
         last_name = NULL,
         avatar_url = NULL,
         city_id = NULL,
         district = NULL,
         contact_phone = NULL,
         username = NULL,
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

  -- Вход: адрес и телефон обезличены (номер можно зарегистрировать заново,
  -- 0221), пароля нет, связей входа нет.
  DELETE FROM auth.identities WHERE user_id = v_user_id;

  UPDATE auth.users
     SET email = 'deleted-' || v_user_id::text || '@deleted.xtrud.pro',
         phone = NULL,
         encrypted_password = NULL,
         email_change = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         updated_at = v_deleted_at
   WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_at', v_deleted_at
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
