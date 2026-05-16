-- 0080_service_pricing_kind_add_from_up_to.sql
--
-- Add 'from' and 'up_to' values to service_pricing_kind enum so мастер может
-- выбирать тип цены для master_services в одном из 5 режимов:
--   - fixed     — точная цена («1500 ₽»)
--   - from      — «от 1500 ₽»
--   - up_to     — «до 2000 ₽»   ← NEW
--   - hourly    — «от 1500 ₽ / час»
--   - quote     — «Договорная»
--   - range     — DEPRECATED (legacy данные). Новые записи мастер не сможет
--                 создать в этом режиме — UI не показывает «Диапазон» в picker.
--
-- Why. Фидбэк user 2026-05-16: «должна быть возможность точную цену указать,
-- либо до указать; диапазоны не нужны». До этого было только fixed/range/
-- hourly/quote — режим «До» полностью отсутствовал, режим «От» эмулировался
-- через range без price_max что давало путаную UX.
--
-- PG ограничение: новое enum-значение нельзя использовать в одной транзакции
-- с его добавлением. Поэтому миграция содержит ТОЛЬКО ALTER TYPE, любые
-- INSERT/UPDATE по новым значениям — отдельной миграцией.

ALTER TYPE service_pricing_kind ADD VALUE IF NOT EXISTS 'from';
ALTER TYPE service_pricing_kind ADD VALUE IF NOT EXISTS 'up_to';
