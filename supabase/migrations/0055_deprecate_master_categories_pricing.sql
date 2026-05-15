-- Migration 0055 — Deprecate master_categories.pricing_mode / pricing / attributes
--
-- Контекст: research/MASTER_ACCOUNT_PLAN.md §P0-1.
-- В архитектуре цен исторически было два параллельных подхода:
--   А) master_categories.pricing_mode (enum) + pricing JSONB + attributes JSONB
--   Б) master_services — плоский прайс title + price_min + price_max + unit
-- Подход (А) не имеет UI для заполнения и используется только в seed-данных
-- демо-мастеров. Подход (Б) — полностью рабочий CRUD (MasterServicesSection).
--
-- Решение 2026-05-15: master_services — single source of truth для цен.
-- pricing_mode / pricing / attributes — оставляем колонки в схеме для обратной
-- совместимости с существующими seed-данными, но новый код их НЕ использует.
-- Удаление колонок — отдельная миграция в v2 после миграции seed-данных.
--
-- Что меняется:
--   1. COMMENT ON COLUMN — явно помечаем поля DEPRECATED
--   2. Код: app/(tabs)/master/[id].tsx больше не отображает PRICING_MODE_LABELS
--   3. master_services связывается с категорией через l2_id/l3_id (миграция 0056)

-- ============================================================================
-- DEPRECATION COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.master_categories.pricing_mode IS
  'DEPRECATED 2026-05-15. Не используется в новом коде. Цены — только через master_services. Колонка оставлена для backward compat с seed-данными миграций 0036/0038/0039/0054. Удаление — в отдельной миграции v2 после очистки seed.';

COMMENT ON COLUMN public.master_categories.pricing IS
  'DEPRECATED 2026-05-15. Не используется. Цены — через master_services. Удаление — в v2.';

COMMENT ON COLUMN public.master_categories.attributes IS
  'DEPRECATED 2026-05-15. Не используется. Зарезервировано для будущих category-specific фильтров (если потребуется), но в текущей архитектуре не задействовано. Удаление — в v2 если останется неиспользованным.';
