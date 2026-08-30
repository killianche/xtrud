-- Migration 0057 — master_services.pricing_kind (P0-10).
--
-- Контекст: research/MASTER_ACCOUNT_PLAN.md §P0-10.
-- В прайсе мастера должен быть режим «уточняется после осмотра» / «по запросу»
-- для услуг где невозможно сразу зафиксировать цену (ремонт под ключ, работы
-- со сложной диагностикой). Без этого режима мастера будут писать «0 ₽» и
-- ломать сортировку в каталоге.
--
-- Что делаем:
--   1. Новый enum service_pricing_kind:
--      - fixed     — одна цена (price_min — единственная цифра, price_max=NULL)
--      - range     — диапазон (price_min..price_max)
--      - hourly    — почасовая (price_min/час, можно с диапазоном)
--      - quote     — по запросу / договорная (цены могут быть NULL)
--   2. Колонка pricing_kind в master_services с default 'fixed'
--   3. Backfill для существующих 36 записей: derived из price_max
--      (price_max IS NULL → fixed, иначе range; для unit=per_hour → hourly)
--   4. CHECK constraint: для quote — price_min может быть NULL; для всех
--      остальных режимов — NOT NULL (как и было).
--
-- Замечание: existing CHECK на price_min >= 0 продолжает работать. Для
-- quote-режима нужно сделать price_min NULLABLE — это разрешит мастеру
-- не указывать цену для этого режима.

-- ============================================================================
-- ENUM
-- ============================================================================

CREATE TYPE public.service_pricing_kind AS ENUM (
  'fixed',
  'range',
  'hourly',
  'quote'
);

COMMENT ON TYPE public.service_pricing_kind IS
  'Тип ценообразования услуги в прайсе мастера. fixed=одна цена, range=диапазон, hourly=почасовая, quote=по запросу/договорная.';

-- ============================================================================
-- COLUMN + RELAX price_min для quote
-- ============================================================================

ALTER TABLE public.master_services
  ADD COLUMN pricing_kind public.service_pricing_kind NOT NULL DEFAULT 'fixed';

-- Делаем price_min nullable: для pricing_kind='quote' цена не обязательна
ALTER TABLE public.master_services
  ALTER COLUMN price_min DROP NOT NULL;

-- Обновляем CHECK: price_min обязателен для всех кроме quote, и >=0 если задан
ALTER TABLE public.master_services
  DROP CONSTRAINT IF EXISTS master_services_price_min_check;

ALTER TABLE public.master_services
  ADD CONSTRAINT master_services_price_consistency_check CHECK (
    (pricing_kind = 'quote' AND price_max IS NULL)
    OR (pricing_kind <> 'quote' AND price_min IS NOT NULL AND price_min >= 0)
  );

COMMENT ON COLUMN public.master_services.pricing_kind IS
  'Тип ценообразования. quote = договорная (price_min/max могут быть NULL); fixed/range/hourly требуют price_min.';
COMMENT ON COLUMN public.master_services.price_min IS
  'Минимальная цена в рублях. NULL допустим только для pricing_kind=quote.';

-- ============================================================================
-- BACKFILL для существующих 36 записей
-- ============================================================================

-- Для unit='per_hour' → pricing_kind='hourly'
UPDATE public.master_services
SET pricing_kind = 'hourly'
WHERE unit = 'per_hour';

-- Для остальных где price_max IS NOT NULL → range
UPDATE public.master_services
SET pricing_kind = 'range'
WHERE price_max IS NOT NULL
  AND price_max > price_min
  AND pricing_kind = 'fixed';

-- Остальные (price_max IS NULL или = price_min, и unit != per_hour)
-- остаются 'fixed' (default).
