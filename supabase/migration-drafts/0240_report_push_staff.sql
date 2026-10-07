-- 0240: push о новой жалобе админам и управляющим (№288, 2026-10-07).
--
-- DECISION владельца 2026-10-07: «Push о новых жалобах … Да, включи».
-- До 0240 (FACT): ни одна функция или триггер на reports push не слал —
-- жалобу видели, только открыв очередь.
--
-- Жалобу вставляет любой вошедший пользователь напрямую (политика
-- reports_insert_own, лимита нет), поэтому рассылка защищена от спама:
--   * о предмете — один push в сутки: повторные жалобы на то же задание,
--     человека или отзыв видны в очереди счётчиком «жалоб на это»;
--   * от одного автора — не больше 3 push в час;
--   * волна (20 push за час по всем) — дальше без push, только очередь;
--   * автор-тестовый аккаунт — без push; сотруднику о своей жалобе — нет.
-- Лимиты считаются по журналу ОТПРАВЛЕННЫХ push (xtrud_private.
-- report_push_log, время сервера), а не по reports.created_at: его
-- задавал клиент, и жалоба «из 2000 года» обходила лимиты, а «из 2100»
-- глушила рассылку навсегда (ревью xtrud-security 2026-10-07, H1, L1).
-- Параллельные вставки выстраиваются advisory-блокировкой (M1).
--
-- Права на вставку жалобы сужены до пяти полей, которые шлёт приложение
-- (use-create-report.ts): created_at, status, reviewed_by, reviewed_at,
-- admin_note клиент больше не задаёт — нельзя подделать «уже рассмотрено»
-- или заметку модератора (ревью, I2). Откат права не расширяет обратно.
-- В тексте push нет имён и названий: только причина и тип предмета.
-- Ошибка рассылки не отменяет жалобу (исключения перехватываются).
--
-- Откат: 0240_report_push_staff_rollback.sql.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0240_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.is_staff_session()') IS NULL THEN
    RAISE EXCEPTION '0240_requires_0239';
  END IF;
  IF to_regprocedure('xtrud_private.notify_staff_new_report()') IS NOT NULL THEN
    RAISE EXCEPTION '0240_already_applied';
  END IF;
END $$;

-- Права на вставку: только поля, которые заполняет человек.
REVOKE INSERT ON public.reports FROM authenticated, anon;
GRANT INSERT (reporter_id, target_type, target_id, reason, description)
  ON public.reports TO authenticated;

CREATE TABLE xtrud_private.report_push_log (
  report_id uuid PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_push_log_sent_idx ON xtrud_private.report_push_log (sent_at);
CREATE INDEX report_push_log_reporter_idx ON xtrud_private.report_push_log (reporter_id, sent_at);
CREATE INDEX report_push_log_target_idx
  ON xtrud_private.report_push_log (target_type, target_id, sent_at);
REVOKE ALL ON xtrud_private.report_push_log FROM PUBLIC, anon, authenticated;

CREATE FUNCTION xtrud_private.notify_staff_new_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_staff uuid;
  v_reason text;
  v_target text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.reporter_id AND u.is_demo) THEN
    RETURN NULL;
  END IF;
  -- Жалобы выстраиваются по очереди: параллельные вставки не проскочат
  -- лимиты, каждый подсчёт ниже видит предыдущие записи журнала.
  PERFORM pg_advisory_xact_lock(hashtext('xtrud.report_push'));
  -- Тот же предмет за сутки — push уже ушёл с первой жалобой.
  IF EXISTS (SELECT 1 FROM xtrud_private.report_push_log l
              WHERE l.target_type = NEW.target_type::text AND l.target_id = NEW.target_id
                AND l.sent_at > now() - interval '1 day') THEN
    RETURN NULL;
  END IF;
  -- Один автор — не больше 3 push в час.
  IF (SELECT count(*) FROM xtrud_private.report_push_log l
       WHERE l.reporter_id = NEW.reporter_id AND l.sent_at > now() - interval '1 hour') >= 3 THEN
    RETURN NULL;
  END IF;
  -- Волна — дальше без push, только очередь.
  IF (SELECT count(*) FROM xtrud_private.report_push_log l
       WHERE l.sent_at > now() - interval '1 hour') >= 20 THEN
    RETURN NULL;
  END IF;
  INSERT INTO xtrud_private.report_push_log (report_id, reporter_id, target_type, target_id)
  VALUES (NEW.id, NEW.reporter_id, NEW.target_type::text, NEW.target_id);

  v_reason := CASE NEW.reason::text
    WHEN 'spam' THEN 'Спам'
    WHEN 'fraud' THEN 'Мошенничество'
    WHEN 'inappropriate' THEN 'Оскорбительный контент'
    WHEN 'fake_profile' THEN 'Фейковый профиль'
    WHEN 'fake_review' THEN 'Накрученный отзыв'
    WHEN 'off_platform' THEN 'Предлагает работать вне платформы'
    WHEN 'safety' THEN 'Угроза безопасности'
    ELSE 'Другое'
  END;
  v_target := CASE NEW.target_type::text
    WHEN 'user' THEN 'на пользователя'
    WHEN 'order' THEN 'на задание'
    WHEN 'review' THEN 'на отзыв'
    WHEN 'message' THEN 'на сообщение'
    ELSE ''
  END;

  -- Получатели — как у is_staff_session() (0239).
  FOR v_staff IN
    SELECT u.id FROM public.users u
     WHERE (u.is_admin OR u.staff_role = 'manager')
       AND NOT u.is_demo AND u.status = 'active'
       AND u.id <> NEW.reporter_id
  LOOP
    BEGIN
      -- Без order_id: иначе жалоба попала бы в счётчики «моих заданий».
      PERFORM public.notify_user(
        v_staff,
        'Новая жалоба',
        v_reason || ' — ' || v_target,
        jsonb_build_object('type', 'system', 'kind', 'new_report', 'report_id', NEW.id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'new_report push %: %', NEW.id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Жалоба важнее уведомления о ней.
  RAISE WARNING 'new_report notify %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION xtrud_private.notify_staff_new_report() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER reports_notify_staff
  AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.notify_staff_new_report();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reports_notify_staff'
                  AND tgrelid = 'public.reports'::regclass) THEN
    RAISE EXCEPTION '0240_trigger_missing';
  END IF;
  IF has_function_privilege('authenticated', 'xtrud_private.notify_staff_new_report()', 'EXECUTE') THEN
    RAISE EXCEPTION '0240_acl_wrong';
  END IF;
  -- Клиент не задаёт время и решение по жалобе (лимиты и честность очереди).
  IF has_column_privilege('authenticated', 'public.reports', 'created_at', 'INSERT')
     OR has_column_privilege('authenticated', 'public.reports', 'status', 'INSERT')
     OR has_column_privilege('authenticated', 'public.reports', 'reviewed_by', 'INSERT')
     OR has_column_privilege('authenticated', 'public.reports', 'admin_note', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.reports', 'description', 'INSERT') THEN
    RAISE EXCEPTION '0240_insert_grants_wrong';
  END IF;
END $$;

COMMIT;
