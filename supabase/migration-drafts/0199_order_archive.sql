-- 0199: личный архив заданий (заказчик) и откликов (специалист).
--
-- DECISION владельца 2026-09-13:
--   - архив личный, для обеих ролей: заказчик прячет своё задание из
--     «Заданий», специалист — свой отклик. У второй стороны, в отзывах и в
--     рейтинге ничего не меняется: orders / order_responses не трогаются;
--   - в архив — только завершившееся; из архива можно вернуть;
--   - удаление завершённого не добавляется, 0099 не трогается.
--
-- Почему отдельная таблица, а не колонки (DECISION основного агента после
-- ревью xtrud-security, M1): SELECT на orders и order_responses выдан ролям
-- приложения на всю таблицу (FACT, relacl на Beget 2026-09-13). Колонку в
-- такой таблице правами не спрятать, а отзыв табличного SELECT ломает
-- select=* у опубликованных сборок. Значит, метка в колонке была бы видна
-- второй стороне. В своей таблице с RLS «только своё» — не видна.
--
-- Одна таблица на обе роли, ключ (user_id, order_id): заказчик и специалист
-- одного задания — всегда разные люди (order_responses_check_not_self не даёт
-- откликнуться на своё, UNIQUE (order_id, master_id) — не больше одного
-- отклика), поэтому метка однозначно принадлежит одной роли.
--
-- Что считается завершившимся (значения сверены с pg_enum на Beget):
--   заказчик   — orders.status IN ('completed', 'cancelled', 'expired');
--   специалист — отклик «больше не активен», ровно как isActiveResponse в
--                src/features/orders/use-my-responses.ts.
--
-- Метка не должна врать, когда дело снова ожило: смена статуса задания или
-- повторный отклик после отзыва удаляют метки тех, для кого дело снова
-- активно (триггеры ниже).
--
-- Чтение клиентом: встраиванием PostgREST 14.12 по внешнему ключу
--   orders?select=*,order_archive_marks(archived_at)
--   order_responses?select=*,order:orders!order_responses_order_id_fkey(*,order_archive_marks(archived_at))
-- RLS отдаёт только собственную метку. Отдельная таблица в TABLE_ALLOWLIST
-- xtrud-api не нужна. Запросы с этим встраиванием — только для вошедшего
-- (у anon нет SELECT на таблицу).
--
-- Порядок раскатки: снимок схемы и backup → эта миграция (аддитивная, старые
-- сборки её не замечают) → xtrud-api с archive_order / archive_response в
-- RPC_ALLOWLIST → сборка с архивом.
-- Черновик. Не применено.

-- ═══════════════════════════════════════════════════════════════════════════
-- Перед применением (на Beget, вручную; результат сохранить)
-- ═══════════════════════════════════════════════════════════════════════════
-- /opt/xtrud/backup.sh
-- docker exec supabase-db pg_dump -U postgres -d postgres --schema-only \
--   -n public -n xtrud_private > /root/schema-before-0199-$(date +%F-%H%M).sql
-- docker exec supabase-db psql -U postgres -d postgres -X -A -c "
--   SELECT relname, relacl FROM pg_class WHERE oid IN ('public.orders'::regclass, 'public.order_responses'::regclass);
--   SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename IN ('orders','order_responses');
--   SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--    WHERE c.relname IN ('orders','order_responses') AND NOT t.tgisinternal ORDER BY 1, 2;
--   SELECT to_regclass('public.order_archive_marks');                       -- ожидается пусто
--   SELECT defaclacl FROM pg_default_acl WHERE defaclrole = 'postgres'::regrole
--      AND defaclnamespace = 'public'::regnamespace AND defaclobjtype = 'r'; -- authenticated=rxtm
-- " > /root/acl-before-0199-$(date +%F-%H%M).txt

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── Таблица меток ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_archive_marks (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, order_id)
);

COMMENT ON TABLE public.order_archive_marks IS
  'Личный архив (0199): заказчик — своё задание, специалист — свой отклик. '
  'Читает только сам человек; пишут только archive_order / archive_response и триггеры.';

CREATE INDEX IF NOT EXISTS order_archive_marks_order_id_idx
  ON public.order_archive_marks (order_id);

ALTER TABLE public.order_archive_marks ENABLE ROW LEVEL SECURITY;

-- Права по умолчанию в public дают authenticated rxtm (FACT, pg_default_acl)
-- — снимаем всё и выдаём только чтение. Запись — только функциями ниже.
REVOKE ALL ON TABLE public.order_archive_marks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_archive_marks TO authenticated;

DROP POLICY IF EXISTS order_archive_marks_read_own ON public.order_archive_marks;
CREATE POLICY order_archive_marks_read_own ON public.order_archive_marks
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── Отклик больше не активен ──────────────────────────────────────────────
-- Единое правило для RPC и триггера. Держать в согласии с isActiveResponse.
CREATE OR REPLACE FUNCTION xtrud_private.order_response_is_closed(
  p_order_status public.order_status,
  p_response_status public.response_status
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_order_status IN ('completed', 'cancelled', 'expired', 'disputed', 'awaiting_confirmation')
      OR p_response_status IN ('rejected', 'withdrawn')
      OR (p_order_status = 'in_progress' AND p_response_status <> 'accepted');
$$;

REVOKE ALL ON FUNCTION xtrud_private.order_response_is_closed(public.order_status, public.response_status)
  FROM PUBLIC, anon, authenticated;

-- ── Триггер: статус задания сменился ──────────────────────────────────────
-- SECURITY DEFINER: статус меняют и функции, и сам заказчик прямым UPDATE
-- (закрыть задание), а писать в таблицу меток роли приложения не могут.
-- Функция только удаляет устаревшие метки.
CREATE OR REPLACE FUNCTION public.orders_release_archive_marks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Заказчик: задание снова живое (reopen, отказ от исполнителя).
  IF NEW.status NOT IN ('completed', 'cancelled', 'expired') THEN
    DELETE FROM public.order_archive_marks
     WHERE order_id = NEW.id AND user_id = NEW.client_id;
  END IF;

  -- Специалисты: чей отклик при новом статусе снова активен.
  DELETE FROM public.order_archive_marks m
   USING public.order_responses r
   WHERE m.order_id = NEW.id
     AND r.order_id = NEW.id
     AND r.master_id = m.user_id
     AND xtrud_private.order_response_is_closed(NEW.status, r.status) IS NOT TRUE;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_release_archive_marks ON public.orders;
CREATE TRIGGER orders_release_archive_marks
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_release_archive_marks();

-- ── Триггер: отклик ожил (повторная отправка после отзыва) ──────────────
CREATE OR REPLACE FUNCTION public.order_responses_release_archive_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.order_archive_marks
   WHERE user_id = NEW.master_id AND order_id = NEW.order_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS order_responses_release_archive_mark ON public.order_responses;
CREATE TRIGGER order_responses_release_archive_mark
  AFTER UPDATE OF status ON public.order_responses
  FOR EACH ROW
  WHEN (OLD.status IN ('rejected', 'withdrawn') AND NEW.status NOT IN ('rejected', 'withdrawn'))
  EXECUTE FUNCTION public.order_responses_release_archive_mark();

REVOKE ALL ON FUNCTION public.orders_release_archive_marks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_responses_release_archive_mark() FROM PUBLIC, anon, authenticated;

-- ── Заказчик: задание в архив / из архива ────────────────────────────────
-- Возвращает метку после вызова: время архивации или NULL.
CREATE OR REPLACE FUNCTION public.archive_order(p_order_id uuid, p_archived boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_status public.order_status;
  v_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;
  IF p_order_id IS NULL OR p_archived IS NULL THEN
    RAISE EXCEPTION 'Не указано задание или действие.'
      USING ERRCODE = '22023', DETAIL = 'archive_invalid_arguments';
  END IF;

  IF NOT p_archived THEN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND client_id = v_caller) THEN
      RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.order_archive_marks WHERE user_id = v_caller AND order_id = p_order_id;
    RETURN NULL;
  END IF;

  -- Фильтр по автору до блокировки: чужую строку не заблокировать.
  -- Блокировка держит статус до записи метки: reopen_order / unpick в то же
  -- время дождутся нас и удалят метку своим триггером.
  SELECT status INTO v_status
    FROM public.orders
   WHERE id = p_order_id AND client_id = v_caller
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('completed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'В архив можно убрать только завершённое, закрытое или истёкшее задание.'
      USING ERRCODE = 'P0001', DETAIL = 'order_not_finished';
  END IF;

  -- Повторный вызов не сдвигает время.
  INSERT INTO public.order_archive_marks (user_id, order_id)
  VALUES (v_caller, p_order_id)
  ON CONFLICT (user_id, order_id) DO NOTHING;

  SELECT archived_at INTO v_at
    FROM public.order_archive_marks
   WHERE user_id = v_caller AND order_id = p_order_id;
  RETURN v_at;
END;
$$;

-- ── Специалист: отклик в архив / из архива ───────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_response(p_response_id uuid, p_archived boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_order_id uuid;
  v_order_status public.order_status;
  v_resp_status public.response_status;
  v_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;
  IF p_response_id IS NULL OR p_archived IS NULL THEN
    RAISE EXCEPTION 'Не указан отклик или действие.'
      USING ERRCODE = '22023', DETAIL = 'archive_invalid_arguments';
  END IF;

  SELECT order_id INTO v_order_id
    FROM public.order_responses
   WHERE id = p_response_id AND master_id = v_caller;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Отклик не найден.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_archived THEN
    DELETE FROM public.order_archive_marks WHERE user_id = v_caller AND order_id = v_order_id;
    RETURN NULL;
  END IF;

  -- Сначала задание, потом отклик — порядок pick/unpick/complete. Обе
  -- блокировки — только для участника: задание, на которое у вызывающего
  -- есть отклик, и его собственный отклик. FOR SHARE не даёт сменить статус
  -- (unpick, reopen, повторный отклик), пока метка не записана.
  SELECT o.status INTO v_order_status
    FROM public.orders o
   WHERE o.id = v_order_id
     AND EXISTS (SELECT 1 FROM public.order_responses r
                  WHERE r.order_id = o.id AND r.master_id = v_caller)
   FOR SHARE OF o;
  SELECT status INTO v_resp_status
    FROM public.order_responses
   WHERE id = p_response_id AND master_id = v_caller
   FOR SHARE;
  IF v_order_status IS NULL OR v_resp_status IS NULL THEN
    RAISE EXCEPTION 'Отклик не найден.' USING ERRCODE = 'P0002';
  END IF;

  IF xtrud_private.order_response_is_closed(v_order_status, v_resp_status) IS NOT TRUE THEN
    RAISE EXCEPTION 'В архив можно убрать только отклик, по которому всё решено.'
      USING ERRCODE = 'P0001', DETAIL = 'response_still_active';
  END IF;

  INSERT INTO public.order_archive_marks (user_id, order_id)
  VALUES (v_caller, v_order_id)
  ON CONFLICT (user_id, order_id) DO NOTHING;

  SELECT archived_at INTO v_at
    FROM public.order_archive_marks
   WHERE user_id = v_caller AND order_id = v_order_id;
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_order(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_response(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_order(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_response(uuid, boolean) TO authenticated, service_role;

-- PostgREST перечитает схему и сам (event trigger pgrst_ddl_watch есть на
-- Beget), явный сигнал — на случай, если его отключат. Уходит при COMMIT.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Проверка после применения
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Таблица, ключ, индекс, RLS:
-- SELECT relrowsecurity, relforcerowsecurity, relacl FROM pg_class
--  WHERE oid = 'public.order_archive_marks'::regclass;
--   → t, f, {postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}
--     (у anon ничего, у authenticated только r).
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.order_archive_marks'::regclass ORDER BY 1;
--   → PRIMARY KEY (user_id, order_id); FK order_id → orders ON DELETE CASCADE;
--     FK user_id → users ON DELETE CASCADE.
-- SELECT indexdef FROM pg_indexes WHERE tablename = 'order_archive_marks';
--   → pkey и order_archive_marks_order_id_idx.
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
--  WHERE tablename = 'order_archive_marks';
--   → одна: order_archive_marks_read_own, SELECT, {authenticated}, (user_id = (SELECT auth.uid())).
--
-- 2. Права ролей приложения:
-- SELECT r, has_table_privilege(r, 'public.order_archive_marks', 'SELECT') s,
--        has_table_privilege(r, 'public.order_archive_marks', 'INSERT') i,
--        has_table_privilege(r, 'public.order_archive_marks', 'UPDATE') u,
--        has_table_privilege(r, 'public.order_archive_marks', 'DELETE') d
--   FROM unnest(ARRAY['anon', 'authenticated']) r;
--   → anon: f f f f; authenticated: t f f f.
-- SELECT has_function_privilege('anon', 'public.archive_order(uuid,boolean)', 'EXECUTE'),
--        has_function_privilege('anon', 'public.archive_response(uuid,boolean)', 'EXECUTE'),
--        has_function_privilege('authenticated', 'public.archive_order(uuid,boolean)', 'EXECUTE'),
--        has_function_privilege('authenticated', 'public.orders_release_archive_marks()', 'EXECUTE'),
--        has_function_privilege('authenticated', 'xtrud_private.order_response_is_closed(public.order_status,public.response_status)', 'EXECUTE');
--   → f, f, t, f, f.
--
-- 3. Функции: SECURITY DEFINER и search_path:
-- SELECT p.oid::regprocedure, p.prosecdef, p.proconfig FROM pg_proc p
--  WHERE p.proname IN ('archive_order', 'archive_response', 'orders_release_archive_marks',
--                      'order_responses_release_archive_mark', 'order_response_is_closed');
--   → prosecdef = t у всех, кроме order_response_is_closed (f);
--     proconfig = {"search_path=public, pg_temp"} у всех.
--
-- 4. orders и order_responses не изменились (сравнить с файлом снимка):
-- SELECT relname, relacl FROM pg_class WHERE oid IN ('public.orders'::regclass, 'public.order_responses'::regclass);
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name IN ('orders', 'order_responses') AND column_name LIKE 'archived%';
--   → relacl как в снимке; колонок archived* нет.
--
-- 5. Поведение — только в транзакциях с ROLLBACK. Подставить реальные uuid:
--    <client>/<completed_order> — заказчик и его завершённое задание;
--    <master>/<resp> — выбранный исполнитель и его отклик на это же задание;
--    <open_order> — открытое задание <client>; <other> — посторонний.
--
-- a) заказчик архивирует; вторая сторона метку НЕ видит:
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- SELECT public.archive_order('<completed_order>', true);                  → время
-- SELECT public.archive_order('<completed_order>', true);                  → то же время
-- SELECT count(*) FROM public.order_archive_marks;                          → 1
-- SELECT set_config('request.jwt.claims', '{"sub":"<master>","role":"authenticated"}', true);
-- SELECT count(*) FROM public.order_archive_marks;                          → 0   (вторая сторона не видит)
-- SELECT count(*) FROM public.order_archive_marks WHERE order_id = '<completed_order>'; → 0
-- SELECT public.archive_response('<resp>', true);                          → время
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- SELECT count(*) FROM public.order_archive_marks;                          → 1   (только своя)
-- SELECT public.archive_order('<completed_order>', false);                 → NULL
-- ROLLBACK;
--
-- b) прямая запись и чужие строки:
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- INSERT INTO public.order_archive_marks (user_id, order_id) VALUES ('<client>', '<open_order>');
--   → ERROR 42501 permission denied for table order_archive_marks
-- ROLLBACK;
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- SELECT public.archive_order('<open_order>', true);   → ERROR P0001 «В архив можно убрать только…»
-- ROLLBACK;
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<other>","role":"authenticated"}', true);
-- SELECT public.archive_order('<completed_order>', true);  → ERROR P0002 «Задание не найдено.»
-- ROLLBACK;
-- BEGIN; SET LOCAL ROLE anon;
-- SELECT public.archive_order('<completed_order>', true);  → ERROR 42501 permission denied for function
-- ROLLBACK;
--
-- c) снятие меток при оживлении (от postgres, ROLLBACK):
-- BEGIN;
-- INSERT INTO public.order_archive_marks (user_id, order_id)
--   SELECT client_id, id FROM public.orders WHERE id = '<cancelled_order>';
-- INSERT INTO public.order_archive_marks (user_id, order_id)
--   SELECT master_id, order_id FROM public.order_responses WHERE order_id = '<cancelled_order>';
-- UPDATE public.orders SET status = 'open' WHERE id = '<cancelled_order>';
-- SELECT m.user_id, r.status FROM public.order_archive_marks m
--   LEFT JOIN public.order_responses r ON r.order_id = m.order_id AND r.master_id = m.user_id
--  WHERE m.order_id = '<cancelled_order>';
--   → метки заказчика и откликов sent/viewed нет; у withdrawn/rejected — осталась.
-- ROLLBACK;
--
-- 6. Через xtrud-api с токеном заказчика и специалиста:
--    GET /v2/rest/orders?select=id,order_archive_marks(archived_at)&id=eq.<completed_order>
--    → у заказчика — его метка, у специалиста — пустой массив.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Откат
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Мягкий (первым; метки сохраняются, чтение работает, кнопка «В архив»
-- получает ошибку):
-- REVOKE EXECUTE ON FUNCTION public.archive_order(uuid, boolean) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.archive_response(uuid, boolean) FROM authenticated;
-- + убрать archive_order / archive_response из RPC_ALLOWLIST xtrud-api.
--
-- Полный — только когда нет сборки, которая встраивает order_archive_marks
-- (её запросы получат 400 PGRST200). Метки теряются — нужно согласие владельца.
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- DROP TRIGGER IF EXISTS orders_release_archive_marks ON public.orders;
-- DROP TRIGGER IF EXISTS order_responses_release_archive_mark ON public.order_responses;
-- DROP FUNCTION IF EXISTS public.archive_order(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.archive_response(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.orders_release_archive_marks();
-- DROP FUNCTION IF EXISTS public.order_responses_release_archive_mark();
-- DROP FUNCTION IF EXISTS xtrud_private.order_response_is_closed(public.order_status, public.response_status);
-- DROP TABLE IF EXISTS public.order_archive_marks;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- После полного отката: SELECT to_regclass('public.order_archive_marks') → пусто;
-- триггеров *_release_archive_* на orders/order_responses нет.
