-- 0199: личный архив заданий (заказчик) и откликов (специалист).
--
-- DECISION владельца 2026-09-13:
--   - архив личный, для обеих ролей: заказчик прячет своё задание из
--     «Заданий», специалист — свой отклик. У второй стороны, в отзывах и в
--     рейтинге ничего не меняется: orders.status / order_responses.status не
--     трогаются, уведомлений нет;
--   - в архив — только завершившееся; из архива можно вернуть;
--   - удаление завершённого не добавляется, 0099 не трогается.
--
-- Что считается завершившимся (значения сверены с pg_enum на Beget 2026-09-13):
--   заказчик   — orders.status IN ('completed', 'cancelled', 'expired');
--   специалист — отклик «больше не активен», ровно как isActiveResponse в
--                src/features/orders/use-my-responses.ts: задание
--                completed/cancelled/expired/disputed/awaiting_confirmation,
--                либо отклик rejected/withdrawn, либо задание in_progress и
--                выбран не этот отклик (status <> 'accepted').
--
-- Безопасность (FACT, live read-only 2026-09-13):
--   - UPDATE и INSERT у authenticated на orders и order_responses выданы
--     ПО КОЛОНКАМ; табличного UPDATE нет (relacl: authenticated=rdm / rm).
--     Новые колонки в эти списки не попадают, прямой PATCH из приложения
--     получает «permission denied». Ставит и снимает метку только RPC ниже.
--   - SELECT выдан на таблицу целиком (anon и authenticated) — новые колонки
--     читаются под теми же политиками RLS, что и остальные. Следствие:
--     вторая сторона технически может увидеть момент архивации (см. отчёт
--     xtrud-backend, вопрос к xtrud-security). anon читает только open-
--     задания, у них метка всегда NULL (CHECK ниже).
--   - Второй рубеж на случай будущего табличного гранта: триггеры
--     *_track_archive отклоняют изменение метки из-под authenticated/anon
--     (тот же приём, что guard_order_lifecycle_direct_update в 0197).
--
-- Метка не должна врать после того, как дело снова ожило:
--   - reopen_order / unpick_order_master / старые сборки, возвращающие
--     задание в open, снимают метку заказчика (BEFORE-триггер) и метки тех
--     откликов, что снова активны (AFTER-триггер);
--   - повторный отклик (submit_order_response: withdrawn → sent) снимает
--     метку специалиста.
--
-- Архивация не сдвигает updated_at: reopen_order считает окно «7 дней» от
-- orders.updated_at, а списки сортируют по нему. set_updated_at ставит now()
-- безусловно, поэтому *_track_archive возвращает прежнее значение, если в
-- строке поменялась только метка. Это работает, потому что BEFORE-триггеры
-- одного события PostgreSQL вызывает по алфавиту имён:
-- 'orders_set_updated_at' < 'orders_track_archive',
-- 'order_responses_set_updated_at' < 'order_responses_track_archive'.
-- Переименование любого из них ломает это — проверка в конце файла.
--
-- Порядок раскатки: эта миграция (аддитивная, старые сборки не замечают
-- новых колонок: читают select=* и пишут явными полями) → xtrud-api с
-- archive_order / archive_response в RPC_ALLOWLIST → сборка с архивом.
-- Черновик. Не применено.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── Колонки ───────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_by_client_at timestamptz;
ALTER TABLE public.order_responses
  ADD COLUMN IF NOT EXISTS archived_by_master_at timestamptz;

COMMENT ON COLUMN public.orders.archived_by_client_at IS
  'Личный архив заказчика (0199). Ставит/снимает только archive_order.';
COMMENT ON COLUMN public.order_responses.archived_by_master_at IS
  'Личный архив специалиста (0199). Ставит/снимает только archive_response.';

-- Заказчик: метка возможна только у завершившегося задания. Проверка по той
-- же строке — обычный CHECK. Для отклика так нельзя (нужен статус задания),
-- там инвариант держат RPC и триггеры.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_archived_only_finished;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_archived_only_finished
  CHECK (archived_by_client_at IS NULL OR status IN ('completed', 'cancelled', 'expired'));

-- Явно: писать метку напрямую не может никто из ролей приложения. Сейчас
-- таких грантов нет — это фиксация намерения, а не исправление.
REVOKE INSERT (archived_by_client_at), UPDATE (archived_by_client_at)
  ON public.orders FROM PUBLIC, anon, authenticated;
REVOKE INSERT (archived_by_master_at), UPDATE (archived_by_master_at)
  ON public.order_responses FROM PUBLIC, anon, authenticated;

-- ── Отклик больше не активен ──────────────────────────────────────────────
-- Единое правило для RPC и триггера. Держать в согласии с isActiveResponse
-- (src/features/orders/use-my-responses.ts).
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

-- ── Триггер: задание ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orders_track_client_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Прямая запись метки из приложения — только через archive_order.
  IF NEW.archived_by_client_at IS DISTINCT FROM OLD.archived_by_client_at
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Архив меняется кнопкой в задании.'
      USING ERRCODE = '42501', DETAIL = 'order_archive_via_rpc';
  END IF;

  -- Задание снова живое (reopen, отказ от исполнителя) — из архива оно
  -- возвращается само, иначе заказчик не увидит дело, требующее действия.
  IF NEW.archived_by_client_at IS NOT NULL
     AND NEW.status NOT IN ('completed', 'cancelled', 'expired') THEN
    NEW.archived_by_client_at := NULL;
  END IF;

  -- Поменялась только метка — updated_at остаётся прежним.
  IF NEW.archived_by_client_at IS DISTINCT FROM OLD.archived_by_client_at
     AND (to_jsonb(NEW) - 'archived_by_client_at' - 'updated_at')
       = (to_jsonb(OLD) - 'archived_by_client_at' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_track_archive ON public.orders;
CREATE TRIGGER orders_track_archive
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_track_client_archive();

-- ── Триггер: отклик ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_responses_track_master_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.archived_by_master_at IS DISTINCT FROM OLD.archived_by_master_at
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Архив меняется кнопкой в отклике.'
      USING ERRCODE = '42501', DETAIL = 'response_archive_via_rpc';
  END IF;

  -- Отклик ожил (повторная отправка после отзыва) — снимаем метку.
  IF NEW.archived_by_master_at IS NOT NULL
     AND OLD.status IN ('rejected', 'withdrawn')
     AND NEW.status NOT IN ('rejected', 'withdrawn') THEN
    NEW.archived_by_master_at := NULL;
  END IF;

  IF NEW.archived_by_master_at IS DISTINCT FROM OLD.archived_by_master_at
     AND (to_jsonb(NEW) - 'archived_by_master_at' - 'updated_at')
       = (to_jsonb(OLD) - 'archived_by_master_at' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_responses_track_archive ON public.order_responses;
CREATE TRIGGER order_responses_track_archive
  BEFORE UPDATE ON public.order_responses
  FOR EACH ROW EXECUTE FUNCTION public.order_responses_track_master_archive();

-- ── Триггер: задание ожило — отклики, снова активные, выходят из архива ──
-- SECURITY DEFINER: смену статуса может сделать и сам заказчик старой
-- сборкой (cancelled → open напрямую), а у authenticated нет права писать
-- метку специалиста. Функция снимает метку и больше ничего не делает.
CREATE OR REPLACE FUNCTION public.orders_release_master_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.order_responses r
       SET archived_by_master_at = NULL
     WHERE r.order_id = NEW.id
       AND r.archived_by_master_at IS NOT NULL
       AND xtrud_private.order_response_is_closed(NEW.status, r.status) IS NOT TRUE;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_release_master_archive ON public.orders;
CREATE TRIGGER orders_release_master_archive
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_release_master_archive();

REVOKE ALL ON FUNCTION public.orders_track_client_archive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_responses_track_master_archive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_release_master_archive() FROM PUBLIC, anon, authenticated;

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
  v_order public.orders%ROWTYPE;
  v_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;
  IF p_order_id IS NULL OR p_archived IS NULL THEN
    RAISE EXCEPTION 'Не указано задание или действие.'
      USING ERRCODE = '22023', DETAIL = 'archive_invalid_arguments';
  END IF;

  -- Блокировка строки: reopen_order / unpick_order_master в то же время
  -- дождутся нас и снимут метку своим триггером, а не наоборот.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  -- Чужое задание неотличимо от несуществующего.
  IF NOT FOUND OR v_order.client_id <> v_caller THEN
    RAISE EXCEPTION 'Задание не найдено.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_archived THEN
    IF v_order.archived_by_client_at IS NOT NULL THEN
      UPDATE public.orders SET archived_by_client_at = NULL WHERE id = p_order_id;
    END IF;
    RETURN NULL;
  END IF;

  IF v_order.status NOT IN ('completed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'В архив можно убрать только завершённое, закрытое или истёкшее задание.'
      USING ERRCODE = 'P0001', DETAIL = 'order_not_finished';
  END IF;

  -- Повторный вызов ничего не меняет и не сдвигает время.
  IF v_order.archived_by_client_at IS NOT NULL THEN
    RETURN v_order.archived_by_client_at;
  END IF;

  v_at := now();
  UPDATE public.orders SET archived_by_client_at = v_at WHERE id = p_order_id;
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
  v_master_id uuid;
  v_order_status public.order_status;
  v_resp_status public.response_status;
  v_archived_at timestamptz;
  v_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Нужен вход в аккаунт.' USING ERRCODE = '28000';
  END IF;
  IF p_response_id IS NULL OR p_archived IS NULL THEN
    RAISE EXCEPTION 'Не указан отклик или действие.'
      USING ERRCODE = '22023', DETAIL = 'archive_invalid_arguments';
  END IF;

  SELECT order_id, master_id INTO v_order_id, v_master_id
    FROM public.order_responses WHERE id = p_response_id;
  IF v_master_id IS NULL OR v_master_id <> v_caller THEN
    RAISE EXCEPTION 'Отклик не найден.' USING ERRCODE = 'P0002';
  END IF;

  -- Сначала задание (FOR SHARE), потом отклик — тот же порядок, что у
  -- pick/unpick/complete. Пока мы держим задание, его статус не сменится,
  -- и проверка «отклик закрыт» не устареет до записи метки.
  SELECT status INTO v_order_status FROM public.orders WHERE id = v_order_id FOR SHARE;
  SELECT status, archived_by_master_at INTO v_resp_status, v_archived_at
    FROM public.order_responses
   WHERE id = p_response_id AND master_id = v_caller
   FOR UPDATE;
  IF v_order_status IS NULL OR v_resp_status IS NULL THEN
    RAISE EXCEPTION 'Отклик не найден.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_archived THEN
    IF v_archived_at IS NOT NULL THEN
      UPDATE public.order_responses SET archived_by_master_at = NULL WHERE id = p_response_id;
    END IF;
    RETURN NULL;
  END IF;

  IF xtrud_private.order_response_is_closed(v_order_status, v_resp_status) IS NOT TRUE THEN
    RAISE EXCEPTION 'В архив можно убрать только отклик, по которому всё решено.'
      USING ERRCODE = 'P0001', DETAIL = 'response_still_active';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RETURN v_archived_at;
  END IF;

  v_at := now();
  UPDATE public.order_responses SET archived_by_master_at = v_at WHERE id = p_response_id;
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_order(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_response(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_order(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_response(uuid, boolean) TO authenticated, service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Проверка после применения (read-only; каждый ожидаемый результат указан)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Колонки есть, nullable, без default:
-- SELECT table_name, column_name, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND column_name IN ('archived_by_client_at', 'archived_by_master_at');
--   → 2 строки, is_nullable = YES, column_default пусто.
--
-- 2. CHECK на заданиях:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'orders_archived_only_finished';
--   → CHECK (archived_by_client_at IS NULL OR status = ANY (...completed, cancelled, expired...)).
--
-- 3. Прямой записи у ролей приложения нет, чтение есть (осознанно):
-- SELECT r.rolname, c.tbl, c.col,
--        has_column_privilege(r.rolname, c.tbl, c.col, 'UPDATE') AS can_update,
--        has_column_privilege(r.rolname, c.tbl, c.col, 'INSERT') AS can_insert,
--        has_column_privilege(r.rolname, c.tbl, c.col, 'SELECT') AS can_select
--   FROM (VALUES ('anon'), ('authenticated')) r(rolname),
--        (VALUES ('public.orders', 'archived_by_client_at'),
--                ('public.order_responses', 'archived_by_master_at')) c(tbl, col);
--   → can_update = f и can_insert = f во всех 4 строках; can_select = t.
-- SELECT relname, relacl FROM pg_class
--  WHERE oid IN ('public.orders'::regclass, 'public.order_responses'::regclass);
--   → как до миграции: authenticated=rdm (orders), authenticated=rm (order_responses) — без «w».
--
-- 4. Функции: SECURITY DEFINER, search_path, права:
-- SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl
--   FROM pg_proc p
--  WHERE p.oid IN ('public.archive_order(uuid,boolean)'::regprocedure,
--                  'public.archive_response(uuid,boolean)'::regprocedure,
--                  'public.orders_release_master_archive()'::regprocedure,
--                  'public.orders_track_client_archive()'::regprocedure,
--                  'public.order_responses_track_master_archive()'::regprocedure,
--                  'xtrud_private.order_response_is_closed(public.order_status,public.response_status)'::regprocedure);
--   → archive_* и orders_release_master_archive: prosecdef = t; остальные f;
--     у всех proconfig = {"search_path=public, pg_temp"};
--     archive_*: EXECUTE только postgres, authenticated, service_role.
-- SELECT has_function_privilege('anon', 'public.archive_order(uuid,boolean)', 'EXECUTE'),
--        has_function_privilege('anon', 'public.archive_response(uuid,boolean)', 'EXECUTE'),
--        has_function_privilege('authenticated', 'public.archive_order(uuid,boolean)', 'EXECUTE'),
--        has_function_privilege('authenticated', 'xtrud_private.order_response_is_closed(public.order_status,public.response_status)', 'EXECUTE');
--   → f, f, t, f.
--
-- 5. Порядок BEFORE-триггеров (от него зависит сохранение updated_at):
-- SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--  WHERE c.relname IN ('orders', 'order_responses') AND NOT t.tgisinternal
--    AND (t.tgtype & 2) = 2 AND (t.tgtype & 16) = 16   -- BEFORE, UPDATE
--  ORDER BY c.relname, t.tgname;
--   → *_set_updated_at стоит выше *_track_archive в обеих таблицах;
--     orders_guard_lifecycle_direct_update на месте (0197 не задет).
--
-- 6. Данные не тронуты:
-- SELECT count(*) FILTER (WHERE archived_by_client_at IS NOT NULL) FROM public.orders;
-- SELECT count(*) FILTER (WHERE archived_by_master_at IS NOT NULL) FROM public.order_responses;
--   → 0 и 0.
--
-- 7. Поведение — только в транзакции с ROLLBACK (данные не меняются).
--    <client>, <master>, <other> — реальные uuid из orders.client_id /
--    order_responses.master_id; <completed_order>, <open_order>, <resp_closed>,
--    <resp_active> — подобрать запросом перед проверкой.
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- UPDATE public.orders SET archived_by_client_at = now() WHERE id = '<completed_order>';
--   → ERROR 42501 permission denied (колоночного гранта нет).
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- SELECT updated_at FROM public.orders WHERE id = '<completed_order>';           -- запомнить
-- SELECT public.archive_order('<completed_order>', true);                         → время
-- SELECT public.archive_order('<completed_order>', true);                         → то же время
-- SELECT updated_at, archived_by_client_at FROM public.orders WHERE id = '<completed_order>';
--   → updated_at не изменился, метка стоит.
-- SELECT public.archive_order('<completed_order>', false);                        → NULL
-- ROLLBACK;
--
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- SELECT public.archive_order('<open_order>', true);      → ERROR P0001 «В архив можно убрать только…»
-- ROLLBACK;
--
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<other>","role":"authenticated"}', true);
-- SELECT public.archive_order('<completed_order>', true); → ERROR P0002 «Задание не найдено.»
-- ROLLBACK;
--
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<master>","role":"authenticated"}', true);
-- SELECT public.archive_response('<resp_closed>', true);  → время
-- SELECT public.archive_response('<resp_active>', true);  → ERROR P0001 «…по которому всё решено.»
-- ROLLBACK;
--
-- BEGIN; SET LOCAL ROLE anon;
-- SELECT public.archive_order('<completed_order>', true); → ERROR 42501 permission denied for function
-- ROLLBACK;
--
-- Снятие метки при оживлении (от postgres, ROLLBACK):
-- BEGIN;
-- UPDATE public.orders SET archived_by_client_at = now() WHERE id = '<cancelled_order>';
-- UPDATE public.order_responses SET archived_by_master_at = now()
--  WHERE order_id = '<cancelled_order>' AND status IN ('sent', 'viewed', 'withdrawn');
-- UPDATE public.orders SET status = 'open' WHERE id = '<cancelled_order>';
-- SELECT archived_by_client_at FROM public.orders WHERE id = '<cancelled_order>';  → NULL
-- SELECT status, archived_by_master_at FROM public.order_responses WHERE order_id = '<cancelled_order>';
--   → у sent/viewed метка NULL, у withdrawn/rejected — осталась.
-- ROLLBACK;
--
-- 8. PostgREST перечитал схему сам (event trigger pgrst_ddl_watch есть на Beget):
--    GET /v2/rest/orders?select=id,archived_by_client_at&limit=1 с токеном → 200.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Откат
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Мягкий (первым; данные сохраняются, старые и новые сборки читают как
-- раньше, кнопка «В архив» получает ошибку):
-- REVOKE EXECUTE ON FUNCTION public.archive_order(uuid, boolean) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.archive_response(uuid, boolean) FROM authenticated;
-- + убрать archive_order / archive_response из RPC_ALLOWLIST xtrud-api.
--
-- Полный — только когда в TestFlight/App Store нет сборки, которая явно
-- выбирает archived_* в select или фильтрует по ним (иначе её запросы
-- получат 400). Метки архива теряются — нужно согласие владельца.
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- DROP TRIGGER IF EXISTS orders_release_master_archive ON public.orders;
-- DROP TRIGGER IF EXISTS orders_track_archive ON public.orders;
-- DROP TRIGGER IF EXISTS order_responses_track_archive ON public.order_responses;
-- DROP FUNCTION IF EXISTS public.archive_order(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.archive_response(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.orders_release_master_archive();
-- DROP FUNCTION IF EXISTS public.orders_track_client_archive();
-- DROP FUNCTION IF EXISTS public.order_responses_track_master_archive();
-- DROP FUNCTION IF EXISTS xtrud_private.order_response_is_closed(public.order_status, public.response_status);
-- ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_archived_only_finished;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS archived_by_client_at;
-- ALTER TABLE public.order_responses DROP COLUMN IF EXISTS archived_by_master_at;
-- COMMIT;
-- После полного отката: пункт 1 проверки → 0 строк; пункт 5 → *_track_archive нет.
