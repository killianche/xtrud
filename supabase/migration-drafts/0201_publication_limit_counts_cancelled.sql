-- 0201: дневной лимит публикаций считает отменённые и удалённые задания.
--
-- Было (FACT, live read-only на Beget 2026-09-14; тело совпадает с 0179):
--   - guard_order_publication_limit (BEFORE INSERT, триггер
--     orders_publication_limit_guard) в дневном окне считает строки orders
--     со status NOT IN ('draft', 'cancelled');
--   - каждый INSERT со status 'open' ставит рассылку «Новая заявка»
--     (orders_notify_masters_on_insert → trg_notify_masters_on_new_order →
--     order_broadcast_queue);
--   - автор может удалить своё задание: политики orders_owner_delete_open
--     (open, draft) и orders_owner_delete_history (cancelled, expired),
--     табличный DELETE у authenticated; в приложении «Удалить» есть для
--     cancelled/expired (src/features/orders/use-delete-order.ts).
--   Итог (xtrud-security N4, 2026-09-13): «опубликовал → отменил →
--   опубликовал» — рассылка специалистам без ограничения. Подсчёт только по
--   orders не закрывает дыру и после учёта cancelled: «опубликовал → закрыл →
--   удалил → опубликовал» доступно из интерфейса, а прямым DELETE — и без
--   закрытия (orders_owner_delete_open). Удалённой строки в orders нет.
--
-- DECISION (владелец делегировал основному агенту, 2026-09-14): отменённые
-- задания считаются в дневном лимите; ошибку исправляют правкой открытого
-- задания, а не отменой. Лимит «не больше трёх активных» не меняется.
--
-- Стало:
--   - xtrud_private.order_publication_log — журнал публикаций (client_id,
--     order_id, published_at) без внешнего ключа на orders: удаление задания
--     запись не стирает. RLS включён, политик нет, права у anon/authenticated
--     отняты; пишет только guard (SECURITY DEFINER, владелец postgres);
--   - дневное окно = объединение (по id задания) двух источников:
--     orders со status <> 'draft' (в том числе cancelled — как в 0175) и
--     журнал. Orders покрывает задания, созданные до 0201, и вставки без JWT
--     (они и раньше попадали в подсчёт), поэтому переносить старые данные в
--     журнал не нужно;
--   - запись в журнал — после обеих проверок, в той же транзакции: отклонённая
--     или откатившаяся вставка следа не оставляет;
--   - записи старше 7 дней по этому автору подчищаются под тем же замком;
--   - advisory lock, тексты ошибок, DETAIL (daily_limit / active_limit),
--     SECURITY DEFINER и search_path — без изменений; триггер не пересоздаётся.
--
-- Совместимость (FACT, git grep 2026-09-14 по HEAD):
--   - вставка задания одна — src/features/orders/use-create-order.ts
--     (status 'open'); текст ошибки и DETAIL прежние, клиенту менять нечего;
--   - reopen_order (live и черновик 0200) и unpick_order_master — UPDATE, а не
--     INSERT: этот триггер на них не срабатывает; лимит «трёх активных» они
--     проверяют сами (0200) под тем же ключом замка. Рассылку «Новая заявка»
--     они не ставят (она только на INSERT);
--   - 0201 не зависит от 0199/0200 и применяется в любом порядке с ними.
--   Что меняется для человека: после публикации следующая — через 24 часа,
--   даже если первое задание закрыто или удалено. Черновики (status 'draft')
--   по-прежнему не считаются.
--
-- Черновик. Не применено.

-- ═══════════════════════════════════════════════════════════════════════════
-- Перед применением (на Beget, вручную; результат сохранить)
-- ═══════════════════════════════════════════════════════════════════════════
-- /opt/xtrud/backup.sh
-- docker exec supabase-db pg_dump -U postgres -d postgres --schema-only \
--   -n public -n xtrud_private > /root/schema-before-0201-$(date +%F-%H%M).sql
-- docker exec supabase-db psql -U postgres -d postgres -X -A -c "
--   SELECT prosrc FROM pg_proc WHERE proname = 'guard_order_publication_limit';
--     -- ожидается тело 0179: status NOT IN ('draft', 'cancelled')
--   SELECT p.prosecdef, p.proconfig, p.proowner::regrole, p.proacl FROM pg_proc p
--    WHERE p.proname = 'guard_order_publication_limit';
--     -- t | {\"search_path=public, pg_temp\"} | postgres
--   SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger
--    WHERE tgfoid = 'public.guard_order_publication_limit()'::regprocedure;
--     -- orders_publication_limit_guard | O | BEFORE INSERT ON public.orders
--   SELECT nspacl FROM pg_namespace WHERE nspname = 'xtrud_private';
--     -- postgres=UC, anon=U, authenticated=U
--   SELECT to_regclass('xtrud_private.order_publication_log');   -- ожидается пусто
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'orders' AND cmd = 'DELETE';
-- " > /root/acl-before-0201-$(date +%F-%H%M).txt

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── Журнал публикаций ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xtrud_private.order_publication_log (
  order_id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE xtrud_private.order_publication_log IS
  'Журнал публикаций заданий (0201) для дневного лимита. Без FK на orders: '
  'удаление задания запись не стирает. Пишет только guard_order_publication_limit.';

CREATE INDEX IF NOT EXISTS order_publication_log_client_published_idx
  ON xtrud_private.order_publication_log (client_id, published_at DESC);

ALTER TABLE xtrud_private.order_publication_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE xtrud_private.order_publication_log FROM PUBLIC, anon, authenticated;

-- ── Лимит публикаций ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_today int;
  v_active int;
  v_last timestamptz;
BEGIN
  IF v_actor IS NULL OR NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('orders_publish_limit:' || NEW.client_id::text, 0));

  -- 0201: отменённые и удалённые тоже считаются (N4). Orders — задания до
  -- журнала и вставки без JWT; журнал — то, что уже удалено из orders.
  SELECT count(*), max(published_at) INTO v_today, v_last
    FROM (
      SELECT o.id, o.created_at AS published_at
        FROM public.orders o
       WHERE o.client_id = NEW.client_id
         AND o.status <> 'draft'
         AND o.created_at > now() - interval '24 hours'
      UNION
      SELECT l.order_id, l.published_at
        FROM xtrud_private.order_publication_log l
       WHERE l.client_id = NEW.client_id
         AND l.published_at > now() - interval '24 hours'
    ) s;
  IF v_today >= 1 THEN
    RAISE EXCEPTION 'Одно задание в день. Следующее можно разместить %',
      to_char((v_last + interval '24 hours') AT TIME ZONE 'Europe/Moscow', 'DD.MM в HH24:MI')
      USING ERRCODE = 'P0001', DETAIL = 'daily_limit';
  END IF;

  SELECT count(*) INTO v_active
    FROM public.orders
   WHERE client_id = NEW.client_id
     AND status IN ('open', 'in_progress', 'awaiting_confirmation');
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'Не больше трёх активных заданий. Закройте одно, чтобы разместить новое.'
      USING ERRCODE = 'P0001', DETAIL = 'active_limit';
  END IF;

  DELETE FROM xtrud_private.order_publication_log
   WHERE client_id = NEW.client_id
     AND published_at < now() - interval '7 days';
  INSERT INTO xtrud_private.order_publication_log (order_id, client_id, published_at)
  VALUES (NEW.id, NEW.client_id, now())
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Триггер orders_publication_limit_guard (BEFORE INSERT) уже вызывает эту
-- функцию; пересоздавать не нужно. Права на функцию CREATE OR REPLACE не
-- меняет.

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Проверка после применения
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Объекты и права:
-- SELECT p.prosecdef, p.proconfig, p.proowner::regrole FROM pg_proc p
--  WHERE p.proname = 'guard_order_publication_limit';
--   → t | {"search_path=public, pg_temp"} | postgres
-- SELECT position('order_publication_log' IN prosrc) > 0,
--        position('NOT IN (''draft'', ''cancelled'')' IN prosrc) = 0
--   FROM pg_proc WHERE proname = 'guard_order_publication_limit';     → t | t
-- SELECT tgenabled FROM pg_trigger WHERE tgname = 'orders_publication_limit_guard';  → O
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'xtrud_private.order_publication_log'::regclass;  → t
-- SELECT r, p, has_table_privilege(r, 'xtrud_private.order_publication_log', p)
--   FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
--   → все f
--
-- 2. Поведение — только с ROLLBACK. <client> — пользователь без публикаций
--    за последние 24 часа и с активными < 3; <l2_id>, <city_id> — существующие
--    значения (взять из любого задания). Если у orders есть другие NOT NULL
--    без default, дописать их в INSERT.
--
-- a) опубликовал → отменил → вторая публикация в тот же день отклоняется:
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- INSERT INTO public.orders (client_id, l2_id, city_id, title, status)
-- VALUES ('<client>', '<l2_id>', '<city_id>', 'проверка 0201', 'open') RETURNING id;  → INSERT 1
-- UPDATE public.orders SET status = 'cancelled', cancel_reason = 'other', cancelled_by = '<client>'
--  WHERE client_id = '<client>' AND title = 'проверка 0201';                           → UPDATE 1
-- INSERT INTO public.orders (client_id, l2_id, city_id, title, status)
-- VALUES ('<client>', '<l2_id>', '<city_id>', 'проверка 0201 второе', 'open');
--   → ERROR P0001 «Одно задание в день. Следующее можно разместить …», DETAIL daily_limit
-- ROLLBACK;
--
-- b) опубликовал → удалил → вторая публикация отклоняется:
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- INSERT INTO public.orders (client_id, l2_id, city_id, title, status)
-- VALUES ('<client>', '<l2_id>', '<city_id>', 'проверка 0201', 'open');               → INSERT 1
-- DELETE FROM public.orders WHERE client_id = '<client>' AND title = 'проверка 0201';  → DELETE 1
-- INSERT INTO public.orders (client_id, l2_id, city_id, title, status)
-- VALUES ('<client>', '<l2_id>', '<city_id>', 'проверка 0201 второе', 'open');
--   → ERROR P0001 «Одно задание в день…», DETAIL daily_limit
-- ROLLBACK;
--
-- c) на следующий день публикация проходит (сдвиг времени первой публикации
--    от postgres внутри той же транзакции):
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<client>","role":"authenticated"}', true);
-- INSERT INTO public.orders (client_id, l2_id, city_id, title, status)
-- VALUES ('<client>', '<l2_id>', '<city_id>', 'проверка 0201', 'open');               → INSERT 1
-- UPDATE public.orders SET status = 'cancelled', cancel_reason = 'other', cancelled_by = '<client>'
--  WHERE client_id = '<client>' AND title = 'проверка 0201';                           → UPDATE 1
-- RESET ROLE;
-- UPDATE public.orders SET created_at = now() - interval '25 hours'
--  WHERE client_id = '<client>' AND title = 'проверка 0201';
-- UPDATE xtrud_private.order_publication_log SET published_at = now() - interval '25 hours'
--  WHERE client_id = '<client>';
-- SET LOCAL ROLE authenticated;
-- INSERT INTO public.orders (client_id, l2_id, city_id, title, status)
-- VALUES ('<client>', '<l2_id>', '<city_id>', 'проверка 0201 второе', 'open');        → INSERT 1
-- ROLLBACK;
--
-- d) лимит трёх активных и черновики — как раньше. Черновик от postgres
--    (с 0200 authenticated вставить draft не может) лимит не трогает;
--    reopen_order / unpick_order_master — проверки 0200 (c, e) проходят без
--    изменений: это UPDATE, этот триггер их не касается.
--
-- 3. Журнал пуст после ROLLBACK:
-- SELECT count(*) FROM xtrud_private.order_publication_log
--  WHERE client_id = '<client>' AND published_at > now() - interval '1 hour';  → 0
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Откат
-- ═══════════════════════════════════════════════════════════════════════════
-- Вернуть тело 0179 (подсчёт без cancelled, без журнала), затем убрать журнал.
-- 0179_publish_limit_fix.sql повторно применим как есть (своя транзакция,
-- CREATE OR REPLACE той же функции):
--   docker cp supabase/migration-drafts/0179_publish_limit_fix.sql supabase-db:/tmp/
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0179_publish_limit_fix.sql
-- затем:
-- BEGIN;
-- DROP TABLE IF EXISTS xtrud_private.order_publication_log;
-- COMMIT;
-- Порядок важен: функция 0201 обращается к журналу, без него любая
-- публикация упадёт. Таблицу — только после возврата функции.
-- После отката: position('order_publication_log' IN prosrc) → f;
-- to_regclass('xtrud_private.order_publication_log') → пусто; prosrc совпадает
-- со снимком acl-before-0201. Откат возвращает известную дыру N4.
