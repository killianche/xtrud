-- 0200: вернуть задание в «Открыто» — только через reopen_order.
--
-- Было (FACT, live read-only на Beget 2026-09-13):
--   - политика orders_owner_edit_open: USING status IN (open, draft,
--     cancelled, expired), WITH CHECK status IN (open, draft, in_progress,
--     cancelled, expired);
--   - guard_order_lifecycle_direct_update (0197) не запрещает переход в open.
--   Итог: автор прямым PATCH /v2/rest/orders возвращал cancelled/expired в
--   open в обход reopen_order — без окна 7 дней, без лимита «не больше трёх
--   активных» и в том числе задание, скрытое модерацией (admin_hide_order
--   ставит cancelled с cancel_reason «moderation: …»).
--   - reopen_order читал задание без блокировки, окно считал от updated_at
--     (его сдвигает любая правка строки), лимит активных не проверял.
--
-- Стало:
--   - guard: из-под authenticated/anon статус open ставится только тем, у
--     кого он уже open; остальное — reopen_order (SECURITY DEFINER, guard его
--     пропускает, как pick/complete в 0197);
--   - orders_owner_edit_open: USING (open, draft) — править можно только
--     открытое (так и делает приложение: экран правки только при open);
--     WITH CHECK без in_progress (выбор исполнителя — pick_order_master);
--   - reopen_order: блокировка строки с фильтром по автору; лимит трёх
--     активных под тем же advisory lock, что guard_order_publication_limit;
--     окно 7 дней — от записи перехода в order_status_log (писать туда роли
--     приложения не могут: RLS включён, политики только на SELECT), для
--     строк без записи — от expires_at (истёкшие) или updated_at; скрытое
--     модерацией открыть заново нельзя.
--
-- Совместимость (FACT, git grep 2026-09-13 по HEAD = сборка 95):
--   - приложение не пишет status 'open' прямым UPDATE: создание — INSERT со
--     status 'open' (use-create-order.ts:108, guard на INSERT не срабатывает),
--     правка — use-update-order.ts без поля status и только при open
--     (app/(details)/orders/edit/[id].tsx:32), закрытие — use-cancel-order.ts
--     (open/in_progress → cancelled), возврат — RPC reopen_order
--     (use-reopen-order.ts:27) с базового коммита f665c18;
--   - сборки ≤41 (App Store 1.0.2 = сборка 21) ходят в /rest/v1 и уже получают
--     410 (FACT: curl https://api.xtrud.pro/rest/v1/orders → 410).
--   Что может сломаться: сборка, открывающая заново прямым UPDATE (в Git
--   такой нет); правка закрытого/истёкшего задания прямым PATCH (в
--   приложении не предлагается); тексты ошибок reopen_order сохранены,
--   добавлен один новый — про лимит активных.
--   Клиентская подсказка canReopenOrder (use-reopen-order.ts) по-прежнему
--   считает окно от updated_at — сервер может отказать с
--   reopen_window_expired, текст для этого уже есть (describe-server-error.ts).
--
-- Черновик. Не применено. Применять после 0199 или независимо — не зависят.

-- ═══════════════════════════════════════════════════════════════════════════
-- Перед применением (на Beget, вручную; результат сохранить)
-- ═══════════════════════════════════════════════════════════════════════════
-- /opt/xtrud/backup.sh
-- docker exec supabase-db pg_dump -U postgres -d postgres --schema-only \
--   -n public -n xtrud_private > /root/schema-before-0200-$(date +%F-%H%M).sql
-- docker exec supabase-db psql -U postgres -d postgres -X -A -c "
--   SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename = 'orders' ORDER BY 1;
--   SELECT prosrc FROM pg_proc WHERE proname IN ('guard_order_lifecycle_direct_update', 'reopen_order', 'guard_order_publication_limit');
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.order_status_log'::regclass;   -- t
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'order_status_log';           -- только SELECT
--   SELECT status, count(*) FROM public.orders GROUP BY 1;
-- " > /root/acl-before-0200-$(date +%F-%H%M).txt

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── guard 0197 + запрет прямого перехода в open ──────────────────────────
CREATE OR REPLACE FUNCTION public.guard_order_lifecycle_direct_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (SELECT auth.uid()) IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Статус задания меняет только автор.'
        USING ERRCODE = '42501', DETAIL = 'order_status_owner_only';
    END IF;
    IF NEW.status IN ('in_progress', 'awaiting_confirmation', 'completed', 'disputed') THEN
      RAISE EXCEPTION 'Обновите приложение: этот шаг делается кнопкой в задании.'
        USING ERRCODE = '42501', DETAIL = 'order_lifecycle_via_rpc';
    END IF;
    -- 0200: «Открыть заново» — только reopen_order (окно, лимит, модерация).
    IF NEW.status = 'open' THEN
      RAISE EXCEPTION 'Обновите приложение: открыть задание заново можно кнопкой в задании.'
        USING ERRCODE = '42501', DETAIL = 'order_reopen_via_rpc';
    END IF;
  END IF;

  IF NEW.picked_master_id IS DISTINCT FROM OLD.picked_master_id THEN
    IF NOT (
      OLD.status = 'open'
      AND NEW.status = 'cancelled'
      AND NEW.cancel_reason = 'found_master'
      AND (
        NEW.picked_master_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.order_responses r
           WHERE r.order_id = NEW.id
             AND r.master_id = NEW.picked_master_id
             AND r.status IN ('sent', 'viewed')
        )
      )
    ) THEN
      RAISE EXCEPTION 'Исполнителя выбирают кнопкой в отклике.'
        USING ERRCODE = '42501', DETAIL = 'order_pick_via_rpc';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Триггер orders_guard_lifecycle_direct_update из 0197 уже вызывает эту
-- функцию; пересоздавать не нужно.

-- ── Политика правки своего задания ───────────────────────────────────────
DROP POLICY IF EXISTS orders_owner_edit_open ON public.orders;
CREATE POLICY orders_owner_edit_open ON public.orders
  FOR UPDATE TO public
  USING (((SELECT auth.uid()) = client_id) AND (status = ANY (ARRAY['open'::public.order_status, 'draft'::public.order_status])))
  WITH CHECK (((SELECT auth.uid()) = client_id) AND (status = ANY (ARRAY['open'::public.order_status, 'draft'::public.order_status, 'cancelled'::public.order_status, 'expired'::public.order_status])));

-- ── reopen_order ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reopen_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_closed_at timestamptz;
  v_active int;
  v_now timestamptz := now();
  v_withdrawn_response record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002'; END IF;

  -- Тот же замок, что у guard_order_publication_limit: лимит активных не
  -- обойти, открывая заново и публикуя новое одновременно. Берётся до
  -- блокировки строки — как и при публикации (INSERT без блокировок строк).
  PERFORM pg_advisory_xact_lock(hashtextextended('orders_publish_limit:' || v_user_id::text, 0));

  -- Фильтр по автору до блокировки: чужое задание не заблокировать и не
  -- отличить от несуществующего.
  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id AND client_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_order.status NOT IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'order_not_reopenable' USING ERRCODE = 'P0001';
  END IF;
  -- Скрытое модерацией (admin_hide_order) возвращает только модерация.
  IF v_order.cancel_reason LIKE 'moderation:%' THEN
    RAISE EXCEPTION 'order_not_reopenable' USING ERRCODE = 'P0001', DETAIL = 'order_hidden_by_moderation';
  END IF;

  -- Окно — от момента, когда задание закрылось или истекло.
  SELECT max(l.created_at) INTO v_closed_at
    FROM public.order_status_log l
   WHERE l.order_id = p_order_id AND l.to_status = v_order.status;
  v_closed_at := coalesce(
    v_closed_at,
    CASE WHEN v_order.status = 'expired' THEN least(v_order.expires_at, v_order.updated_at) END,
    v_order.updated_at
  );
  IF v_closed_at < v_now - interval '7 days' THEN
    RAISE EXCEPTION 'reopen_window_expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_active
    FROM public.orders
   WHERE client_id = v_user_id
     AND status IN ('open', 'in_progress', 'awaiting_confirmation');
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'Не больше трёх активных заданий. Закройте одно, чтобы открыть это заново.'
      USING ERRCODE = 'P0001', DETAIL = 'active_limit';
  END IF;

  -- Исполнитель, выбранный до отмены (0196), снова обычный откликнувшийся:
  -- его отклик отозван, и он получит «Клиент возобновил заказ» вместе с другими.
  UPDATE public.order_responses SET status = 'withdrawn', updated_at = v_now
   WHERE order_id = p_order_id AND status = 'accepted';
  UPDATE public.orders SET status = 'open', cancelled_by = NULL, cancel_reason = NULL,
    picked_master_id = NULL, picked_at = NULL, last_activity_at = v_now,
    expires_at = v_now + interval '14 days', updated_at = v_now
  WHERE id = p_order_id;
  FOR v_withdrawn_response IN
    SELECT master_id FROM public.order_responses WHERE order_id = p_order_id AND status = 'withdrawn' LIMIT 50
  LOOP
    PERFORM public.notify_user(v_withdrawn_response.master_id, 'Клиент возобновил заказ',
      'Заявка снова открыта. Можно откликнуться заново.',
      jsonb_build_object('type', 'order_reopened', 'order_id', p_order_id));
  END LOOP;
  INSERT INTO public.order_status_log (order_id, from_status, to_status, transition_code, triggered_by, triggered_kind, metadata)
  VALUES (p_order_id, v_order.status, 'open', 'T9', v_user_id, 'user', jsonb_build_object('reopen_window_left_days', 7));
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_order(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Проверка после применения
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Политика:
-- SELECT qual, with_check FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_owner_edit_open';
--   → USING: client_id и status IN (open, draft); WITH CHECK: (open, draft, cancelled, expired).
--
-- 2. Функции и права:
-- SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl FROM pg_proc p
--  WHERE p.proname IN ('reopen_order', 'guard_order_lifecycle_direct_update');
--   → reopen_order: t, {"search_path=public, pg_temp"}, EXECUTE у postgres/authenticated/service_role;
--     guard: f, тот же search_path.
-- SELECT position('order_reopen_via_rpc' IN prosrc) > 0 FROM pg_proc WHERE proname = 'guard_order_lifecycle_direct_update';  → t
-- SELECT tgenabled FROM pg_trigger WHERE tgname = 'orders_guard_lifecycle_direct_update';  → O
--
-- 3. Поведение — только с ROLLBACK. <client> — автор; <cancelled_order> —
--    его закрытое задание (закрыто < 7 дней назад, без модерации);
--    <open_order> — его открытое.
--
-- a) прямой возврат в open запрещён (guard или политика):
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- UPDATE public.orders SET status = 'open' WHERE id = '<cancelled_order>';
--   → UPDATE 0 (политика больше не видит закрытое) — строка не изменилась.
-- SELECT status FROM public.orders WHERE id = '<cancelled_order>';        → cancelled
-- ROLLBACK;
--
-- b) правка открытого и закрытие работают как раньше:
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- UPDATE public.orders SET title = title WHERE id = '<open_order>';        → UPDATE 1
-- UPDATE public.orders SET status = 'cancelled', cancel_reason = 'other', cancelled_by = '<client>'
--  WHERE id = '<open_order>';                                               → UPDATE 1
-- UPDATE public.orders SET status = 'open' WHERE id = '<open_order>';     → UPDATE 0 (закрытое не правится)
-- ROLLBACK;
--
-- c) reopen_order:
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- SELECT public.reopen_order('<cancelled_order>');                          → успех, если активных < 3
-- SELECT status FROM public.orders WHERE id = '<cancelled_order>';        → open
-- ROLLBACK;
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<other>","role":"authenticated"}', true);
-- SELECT public.reopen_order('<cancelled_order>');                          → ERROR P0002 order_not_found
-- ROLLBACK;
--
-- d) скрытое модерацией (от postgres, ROLLBACK):
-- BEGIN;
-- UPDATE public.orders SET cancel_reason = 'moderation: test' WHERE id = '<cancelled_order>';
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- SELECT public.reopen_order('<cancelled_order>');                          → ERROR order_not_reopenable
-- ROLLBACK;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Откат
-- ═══════════════════════════════════════════════════════════════════════════
-- Файл 0197_order_lifecycle_guard.sql повторно применим как есть (CREATE OR
-- REPLACE guard и reopen_order, DROP/CREATE TRIGGER) и возвращает обе функции
-- к прежнему виду. Политику — вручную, в той же транзакции нельзя (0197
-- открывает свою), поэтому по порядку:
--   docker cp supabase/migration-drafts/0197_order_lifecycle_guard.sql supabase-db:/tmp/
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0197_order_lifecycle_guard.sql
-- затем:
-- BEGIN;
-- DROP POLICY IF EXISTS orders_owner_edit_open ON public.orders;
-- CREATE POLICY orders_owner_edit_open ON public.orders
--   FOR UPDATE TO public
--   USING (((SELECT auth.uid()) = client_id) AND (status = ANY (ARRAY['open'::public.order_status, 'draft'::public.order_status, 'cancelled'::public.order_status, 'expired'::public.order_status])))
--   WITH CHECK (((SELECT auth.uid()) = client_id) AND (status = ANY (ARRAY['open'::public.order_status, 'draft'::public.order_status, 'in_progress'::public.order_status, 'cancelled'::public.order_status, 'expired'::public.order_status])));
-- REVOKE ALL ON FUNCTION public.reopen_order(uuid) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.reopen_order(uuid) TO authenticated, service_role;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- После отката: пункт 1 проверки показывает прежние USING/WITH CHECK (как в
-- снимке acl-before-0200); position('order_reopen_via_rpc' …) → f.
-- Откат возвращает известную дыру (прямой возврат в open) — только если 0200
-- ломает что-то, чего нет в Git.
