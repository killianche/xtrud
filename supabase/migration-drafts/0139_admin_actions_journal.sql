-- ЧЕРНОВИК. Шаг 1 «закалка базы» из docs/ADMIN_PANEL.md §9.1, часть 3 из 4:
-- журнал админских действий public.admin_actions.
--
-- НЕ ПРИМЕНЯТЬ ПО ИМЕНИ ФАЙЛА. Условия продвижения — supabase/migration-drafts/README.md.
--
-- ЗАВИСИМОСТЬ: 0137_admin_session_function.sql. Проверяется в SQL, а не по
-- соглашению: существования имени недостаточно, сверяется форма объекта.
--
-- ===========================================================================
-- ЗАЧЕМ (docs/ADMIN_PANEL.md §2 и §4)
-- ===========================================================================
--
--   «Журнала админских действий нет — на вопрос "кто это сделал" ответа не
--    существует.»
--   §4.4: «Журнал действий — кто, когда, по какой жалобе, что сделал, была ли
--    отмена.»
--
-- ===========================================================================
-- ЧЕТЫРЕ РЕШЕНИЯ, КОТОРЫЕ ЗДЕСЬ ПРИНЯТЫ ЯВНО
-- ===========================================================================
--
-- 1. НОВАЯ ТАБЛИЦА В public РОЖДАЕТСЯ ОТКРЫТОЙ ВСЕМ.
--    В production действует
--      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
--        TO anon, authenticated, service_role;
--    поэтому CREATE TABLE сам по себе выдаёт INSERT/UPDATE/DELETE/TRUNCATE
--    ролям anon и authenticated. Журнал, который может переписать любой
--    зарегистрированный пользователь, хуже отсутствия журнала: он создаёт
--    ложную уверенность. Гранты снимаются здесь же и проверяются в конце.
--
-- 2. НЕИЗМЕНЯЕМОСТЬ — ТРИГГЕРОМ, А НЕ ТОЛЬКО ГРАНТАМИ.
--    Требование «без UPDATE/DELETE даже админу» нельзя выполнить одними
--    грантами: владелец базы всё равно их имеет. Поэтому стоит триггер,
--    который отвергает UPDATE и DELETE безусловно — включая postgres. У него
--    намеренно НЕТ аварийного выхода вида current_user = 'postgres', в
--    отличие от 0130: там выход нужен для сопровождения прав, здесь любое
--    исключение обесценивает журнал.
--    Отдельно закрыт TRUNCATE: он не вызывает строчные триггеры и не
--    подчиняется RLS, поэтому для него нужен STATEMENT-триггер BEFORE TRUNCATE.
--
-- 3. АВТОР ЗАПИСИ НЕ ПРИХОДИТ ПАРАМЕТРОМ.
--    admin_id берётся из auth.uid() внутри SECURITY DEFINER функции. Иначе
--    журнал отвечал бы на вопрос «кем представился вызывающий», а не «кто это
--    сделал».
--
-- 4. FOREIGN KEY НА users И reports СОЗНАТЕЛЬНО НЕ СТАВИТСЯ.
--    Журнал обязан пережить свой предмет. FK с ON DELETE CASCADE стирал бы
--    историю вместе с удалённым аккаунтом; FK с RESTRICT ломал бы удаление
--    аккаунта; FK с SET NULL менял бы уже записанную строку и упирался бы в
--    триггер неизменяемости. Тем же приёмом пользуется reports.target_id
--    (supabase/migrations/0029_reports_table.sql:32). Взамен пишется
--    admin_label — снимок того, кем был автор в момент действия.
--
-- «Была ли отмена» — self-FK reverts_action_id: отменяющее действие ссылается
-- на отменяемое. Отмена, таким образом, тоже действие с обязательной
-- причиной, а не редактирование прошлой записи. Одно действие можно отменить
-- только один раз (частичный UNIQUE-индекс).
--
-- ЧЕГО ЭТА МИГРАЦИЯ НЕ ДЕЛАЕТ: не переводит существующие админские действия
-- на RPC. Пока модерация идёт прямым UPDATE (src/features/admin/use-admin.ts),
-- журнал остаётся пустым — это и есть причина, по которой §9 ставит RPC
-- шагом 2. Журнал заводится первым, чтобы шагу 2 было куда писать.
--
-- Откат: 0140_revert_admin_actions_journal.sql.

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1. Preflight — fail-closed
-- ===========================================================================

DO $preflight$
DECLARE
  v_oid oid;
  v_secdef boolean;
  v_owner name;
  v_src text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'admin_actions_requires_database_owner'
      USING DETAIL = format('current_user = %L', current_user);
  END IF;

  SELECT p.oid, p.prosecdef, pg_get_userbyid(p.proowner), p.prosrc
    INTO v_oid, v_secdef, v_owner, v_src
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'is_admin_session'
     AND p.pronargs = 0;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'admin_actions_requires_admin_session_function'
      USING DETAIL = 'public.is_admin_session() отсутствует.',
            HINT = 'Сначала применить 0137_admin_session_function.sql.';
  END IF;

  -- Существования имени недостаточно: чужой объект с тем же именем сделал бы
  -- журнал доступным кому угодно.
  IF NOT v_secdef OR v_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'admin_actions_foreign_admin_session_requires_live_audit'
      USING DETAIL = format('is_admin_session(): prosecdef=%s, владелец=%L', v_secdef, v_owner);
  END IF;

  IF v_src NOT LIKE '%auth.sessions%' OR v_src NOT LIKE '%aal2%' THEN
    RAISE EXCEPTION 'admin_actions_foreign_admin_session_requires_live_audit'
      USING DETAIL = 'is_admin_session() не читает уровень доверия из auth.sessions.',
            HINT = 'Журнал не должен опираться на функцию, которая доверяет клейму JWT.';
  END IF;

  IF to_regclass('public.admin_actions') IS NOT NULL THEN
    RAISE EXCEPTION 'admin_actions_already_exists'
      USING DETAIL = 'public.admin_actions уже существует.',
            HINT = 'Черновик не переписывает существующий журнал: это уничтожило бы историю. Сверить с live-снимком.';
  END IF;
END
$preflight$;

-- ===========================================================================
-- 2. Таблица
-- ===========================================================================

CREATE TABLE public.admin_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_at      timestamptz NOT NULL DEFAULT now(),

  -- кто
  admin_id          uuid NOT NULL,
  admin_label       text,          -- снимок имени/username на момент действия

  -- по какой жалобе (может отсутствовать: модератор вправе действовать сам)
  report_id         uuid,

  -- над каким объектом
  target_type       text NOT NULL,
  target_id         uuid NOT NULL,

  -- что сделал и почему
  action            text NOT NULL,
  reason            text NOT NULL,
  details           jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- была ли отмена: отменяющее действие ссылается на отменяемое
  reverts_action_id uuid REFERENCES public.admin_actions(id),

  CONSTRAINT admin_actions_target_type_check CHECK (
    target_type = ANY (ARRAY['user', 'order', 'order_response', 'review', 'report', 'storage_object'])),
  CONSTRAINT admin_actions_action_check CHECK (
    action = ANY (ARRAY[
      'warn',            -- предупреждение
      'suspend',         -- приостановка на срок
      'unsuspend',       -- снятие приостановки
      'ban',             -- постоянная блокировка
      'unban',           -- снятие блокировки
      'hide',            -- скрыть объект (заказ, отзыв)
      'unhide',          -- вернуть объект
      'dismiss_report',  -- жалоба отклонена
      'resolve_report',  -- жалоба закрыта действием
      'issue_signed_url' -- выдана подписанная ссылка на приватный файл
    ])),
  CONSTRAINT admin_actions_reason_check CHECK (
    length(btrim(reason)) >= 3 AND length(reason) <= 1000),
  CONSTRAINT admin_actions_not_self_revert CHECK (
    reverts_action_id IS NULL OR reverts_action_id <> id)
);

COMMENT ON TABLE public.admin_actions IS
  'Неизменяемый журнал админских действий: кто, когда, по какой жалобе, над каким объектом, что сделал, почему и что этим отменено. Пишется только через public.admin_log_action(). UPDATE, DELETE и TRUNCATE запрещены триггерами безусловно, включая владельца базы. docs/ADMIN_PANEL.md §4.';
COMMENT ON COLUMN public.admin_actions.admin_id IS
  'auth.uid() автора действия. Без FK намеренно: журнал переживает удаление аккаунта.';
COMMENT ON COLUMN public.admin_actions.admin_label IS
  'Кем был автор в момент действия. Снимок, а не ссылка: имя может смениться, журнал — нет.';
COMMENT ON COLUMN public.admin_actions.report_id IS
  'Жалоба, по которой действовал модератор. NULL — действие по собственной инициативе. Без FK намеренно, как и reports.target_id в 0029.';
COMMENT ON COLUMN public.admin_actions.reverts_action_id IS
  'Отменяемое действие. Отмена — такая же запись с обязательной причиной, а не правка прошлой строки.';

CREATE INDEX admin_actions_target_idx ON public.admin_actions (target_type, target_id, performed_at DESC);
CREATE INDEX admin_actions_admin_idx  ON public.admin_actions (admin_id, performed_at DESC);
CREATE INDEX admin_actions_report_idx ON public.admin_actions (report_id, performed_at DESC) WHERE report_id IS NOT NULL;
CREATE UNIQUE INDEX admin_actions_single_revert_idx ON public.admin_actions (reverts_action_id) WHERE reverts_action_id IS NOT NULL;

-- ===========================================================================
-- 3. Неизменяемость
-- ===========================================================================

CREATE FUNCTION public.admin_actions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Аварийного выхода нет намеренно. Журнал, из которого можно стереть
  -- строку «по уважительной причине», отвечает на вопрос «кто это сделал»
  -- только пока никто не заинтересован в другом ответе.
  RAISE EXCEPTION 'Журнал админских действий неизменяем'
    USING ERRCODE = '42501',
          DETAIL = format('операция %s над public.admin_actions запрещена', TG_OP),
          HINT = 'Отмена действия оформляется НОВОЙ записью с reverts_action_id, а не правкой старой.';
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_actions_append_only() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER admin_actions_no_update
  BEFORE UPDATE ON public.admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.admin_actions_append_only();

CREATE TRIGGER admin_actions_no_delete
  BEFORE DELETE ON public.admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.admin_actions_append_only();

-- TRUNCATE не вызывает строчные триггеры и не подчиняется RLS.
CREATE TRIGGER admin_actions_no_truncate
  BEFORE TRUNCATE ON public.admin_actions
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_actions_append_only();

-- ===========================================================================
-- 4. Доступ
-- ===========================================================================

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Снимаем то, что выдали дефолтные привилегии Supabase при CREATE TABLE.
REVOKE ALL ON public.admin_actions FROM PUBLIC, anon, authenticated, service_role;

-- Читать может только администратор с подтверждённым вторым фактором.
-- Грант даёт возможность обратиться к таблице, RLS решает, что видно.
GRANT SELECT ON public.admin_actions TO authenticated;

CREATE POLICY admin_actions_admin_select ON public.admin_actions
  FOR SELECT USING (public.is_admin_session());

-- INSERT-политики нет: писать можно только через SECURITY DEFINER функцию
-- ниже, которая исполняется владельцем таблицы и потому не проходит через RLS.

-- ===========================================================================
-- 5. Единственный путь записи
-- ===========================================================================

CREATE FUNCTION public.admin_log_action(
  p_action            text,
  p_target_type       text,
  p_target_id         uuid,
  p_reason            text,
  p_report_id         uuid    DEFAULT NULL,
  p_details           jsonb   DEFAULT '{}'::jsonb,
  p_reverts_action_id uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_admin_id uuid := auth.uid();
  v_label    text;
  v_id       uuid;
BEGIN
  -- Fail-closed: без подтверждённой админской сессии записи не появляется.
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'Действие доступно только администратору с подтверждённым вторым фактором'
      USING ERRCODE = '42501',
            DETAIL = 'public.is_admin_session() = false';
  END IF;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Причина обязательна'
      USING ERRCODE = '22023', DETAIL = 'admin_log_action: пустая причина';
  END IF;

  IF p_reverts_action_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.admin_actions WHERE id = p_reverts_action_id) THEN
    RAISE EXCEPTION 'Отменяемое действие не найдено'
      USING ERRCODE = 'P0002', DETAIL = format('reverts_action_id = %L', p_reverts_action_id);
  END IF;

  SELECT coalesce(u.username, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''))
    INTO v_label
    FROM public.users u
   WHERE u.id = v_admin_id;

  INSERT INTO public.admin_actions (
    admin_id, admin_label, report_id, target_type, target_id,
    action, reason, details, reverts_action_id)
  VALUES (
    v_admin_id, v_label, p_report_id, p_target_type, p_target_id,
    p_action, btrim(p_reason), coalesce(p_details, '{}'::jsonb), p_reverts_action_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$fn$;

COMMENT ON FUNCTION public.admin_log_action(text, text, uuid, text, uuid, jsonb, uuid) IS
  'Единственный путь записи в public.admin_actions. Автор берётся из auth.uid(), а не из параметра. Требует public.is_admin_session().';

REVOKE ALL ON FUNCTION public.admin_log_action(text, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, text, uuid, jsonb, uuid) TO authenticated;

-- ===========================================================================
-- 6. Самопроверка
-- ===========================================================================

DO $verify$
DECLARE
  v_bad text;
  v_priv text;
BEGIN
  -- 6.1 Ни одна API-роль не должна иметь ничего, кроме SELECT у authenticated.
  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    IF has_table_privilege('anon', 'public.admin_actions', v_priv)
       OR has_table_privilege('authenticated', 'public.admin_actions', v_priv)
       OR has_table_privilege('service_role', 'public.admin_actions', v_priv) THEN
      RAISE EXCEPTION 'admin_actions_api_role_can_write'
        USING DETAIL = format('привилегия %s осталась у API-роли', v_priv),
              HINT = 'Скорее всего сработали ALTER DEFAULT PRIVILEGES Supabase, а REVOKE не покрыл роль.';
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.admin_actions', 'SELECT')
     OR has_table_privilege('service_role', 'public.admin_actions', 'SELECT') THEN
    RAISE EXCEPTION 'admin_actions_readable_by_wrong_role';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.admin_actions', 'SELECT') THEN
    RAISE EXCEPTION 'admin_actions_not_readable_by_authenticated';
  END IF;

  -- 6.2 RLS включён и SELECT-политика опирается на is_admin_session().
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.admin_actions'::regclass) THEN
    RAISE EXCEPTION 'admin_actions_rls_disabled';
  END IF;

  SELECT string_agg(policyname, ', ') INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'admin_actions'
     AND (cmd <> 'SELECT' OR coalesce(qual, '') NOT LIKE '%is_admin_session%');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'admin_actions_unexpected_policy' USING DETAIL = v_bad;
  END IF;

  -- 6.3 Все три триггера неизменяемости на месте и включены.
  FOREACH v_priv IN ARRAY ARRAY['admin_actions_no_update', 'admin_actions_no_delete', 'admin_actions_no_truncate'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid = 'public.admin_actions'::regclass
         AND t.tgname = v_priv AND NOT t.tgisinternal AND t.tgenabled <> 'D')
    THEN
      RAISE EXCEPTION 'admin_actions_immutability_trigger_missing' USING DETAIL = v_priv;
    END IF;
  END LOOP;

  -- 6.4 Неизменяемость доказывается ПОПЫТКОЙ, а не наличием триггера. Блок
  --     исполняется владельцем базы: если он сможет изменить строку, значит
  --     «даже админу нельзя» — неправда.
  --
  --     Пробная запись не остаётся в журнале: весь блок — вложенная
  --     транзакция, которая в конце намеренно откатывается сигнальной
  --     ошибкой. Иначе первая строка настоящего журнала была бы мусором,
  --     а удалить её нельзя по определению.
  BEGIN
    INSERT INTO public.admin_actions (admin_id, target_type, target_id, action, reason)
    VALUES ('00000000-0000-4000-8000-000000000000', 'user',
            '00000000-0000-4000-8000-000000000000', 'warn', 'проба неизменяемости при применении миграции');

    BEGIN
      UPDATE public.admin_actions SET reason = 'подмена'
       WHERE reason = 'проба неизменяемости при применении миграции';
      RAISE EXCEPTION 'admin_actions_update_was_allowed'
        USING DETAIL = 'UPDATE журнала прошёл под владельцем базы: триггер неизменяемости не работает.';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
      DELETE FROM public.admin_actions
       WHERE reason = 'проба неизменяемости при применении миграции';
      RAISE EXCEPTION 'admin_actions_delete_was_allowed'
        USING DETAIL = 'DELETE журнала прошёл под владельцем базы: триггер неизменяемости не работает.';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
      TRUNCATE public.admin_actions;
      RAISE EXCEPTION 'admin_actions_truncate_was_allowed'
        USING DETAIL = 'TRUNCATE журнала прошёл: TRUNCATE не вызывает строчные триггеры и не подчиняется RLS.';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
    END;

    -- сигнальная ошибка: откатывает пробную вставку и ничего не значит сама
    RAISE EXCEPTION 'admin_actions_selfcheck_rollback' USING ERRCODE = 'XTS01';
  EXCEPTION
    WHEN SQLSTATE 'XTS01' THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM public.admin_actions) THEN
    RAISE EXCEPTION 'admin_actions_selfcheck_left_a_row'
      USING DETAIL = 'Проба неизменяемости не откатилась; журнал не должен начинаться со служебной строки.';
  END IF;

  RAISE NOTICE 'admin_actions: журнал создан; UPDATE, DELETE и TRUNCATE отвергнуты даже под владельцем базы, пробная строка откачена.';
END
$verify$;
