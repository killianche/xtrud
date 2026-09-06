-- 0161 — индексы под ленту заданий и отклики на масштабе 1 000–10 000 заданий.
--
-- DECISION владельца 2026-09-06: «даже если будет 1000 заданий — не должно
-- зависать». FACT (pg_indexes, live): ни один индекс не покрывал порядок
-- ленты (status='open' ORDER BY created_at DESC, id DESC), фильтр по городу
-- шёл через индекс без created_at, по району индекса не было вовсе.
-- Нагрузочный тест с 1 006 синтетическими заданиями (в транзакции с
-- откатом) показал 6,7 мс на первую страницу — терпимо, но каждый скролл-шаг
-- шёл полным сканом с сортировкой, и это растёт линейно с таблицей.
--
-- Таблицы сейчас маленькие, поэтому обычный CREATE INDEX; на большом объёме
-- такие индексы строят CONCURRENTLY вне транзакции.

BEGIN;

-- (1) Лента без фильтра — режим по умолчанию на /find.
CREATE INDEX IF NOT EXISTS orders_open_created_id_idx
  ON public.orders (created_at DESC, id DESC) WHERE status = 'open';

-- (2) Лента с фильтром категории + счётчик непрочитанных заданий.
--     В отличие от orders_l2_status_created_idx содержит id: keyset-курсор
--     без доборной сортировки.
CREATE INDEX IF NOT EXISTS orders_open_l2_created_id_idx
  ON public.orders (l2_id, created_at DESC, id DESC) WHERE status = 'open';

-- (3) Фильтр города.
CREATE INDEX IF NOT EXISTS orders_open_city_created_id_idx
  ON public.orders (city_id, created_at DESC, id DESC) WHERE status = 'open';

-- (4) Фильтр района.
CREATE INDEX IF NOT EXISTS orders_open_district_created_id_idx
  ON public.orders (district, created_at DESC, id DESC) WHERE status = 'open';

-- (5) Активные задания клиента (лимит публикаций) и счётчик откликов.
CREATE INDEX IF NOT EXISTS orders_client_status_created_idx
  ON public.orders (client_id, status, created_at DESC);

-- (6) Отклики на экране задания — без доборной сортировки.
CREATE INDEX IF NOT EXISTS order_responses_order_created_idx
  ON public.order_responses (order_id, created_at DESC);

-- (7) Дневной лимит откликов. Работает вместе с 0162 (диапазон дат вместо
--     created_at::date — приведение к дате индекс не использует).
CREATE INDEX IF NOT EXISTS order_responses_master_created_idx
  ON public.order_responses (master_id, created_at DESC) WHERE status <> 'withdrawn';

DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(n, ', ') INTO v_missing FROM unnest(ARRAY[
    'orders_open_created_id_idx','orders_open_l2_created_id_idx','orders_open_city_created_id_idx',
    'orders_open_district_created_id_idx','orders_client_status_created_idx',
    'order_responses_order_created_idx','order_responses_master_created_idx']) n
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname = n);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'feed_indexes_missing: %', v_missing; END IF;
END $$;

COMMIT;
