-- Migration 0071 — расширение order_status ENUM значениями для lifecycle v2.
--
-- ВЫНЕСЕНО ОТДЕЛЬНО от 0072 (columns + constraints), потому что
-- PostgreSQL не позволяет использовать новое значение ENUM в той же транзакции,
-- где оно добавлено. CHECK-constraint вида `status IN ('awaiting_confirmation', ...)`
-- упадёт, если ALTER TYPE ADD VALUE стоит в той же миграции.
--
-- См. https://www.postgresql.org/docs/current/sql-altertype.html
--   "ALTER TYPE ... ADD VALUE ... cannot be executed inside a transaction block
--    if the new value will be used within that same transaction."
--
-- Поэтому 0071 — только ENUM, 0072 — всё остальное.
--
-- См. docs/lifecycle.md §2.1.

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_confirmation' AFTER 'in_progress';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'disputed' AFTER 'completed';
