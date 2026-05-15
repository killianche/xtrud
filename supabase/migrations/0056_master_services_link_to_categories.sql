-- Migration 0056 — master_services: связь с таксономией категорий (P0-2).
--
-- Контекст: research/MASTER_ACCOUNT_PLAN.md §P0-2 (после §P0-1 деflagging
-- master_categories.pricing_mode). Сейчас master_services.title — свободный
-- текст без связи с categories_l2 / categories_l3, поэтому невозможно сделать
-- поиск «найти сантехника, который делает установку унитаза за X₽» — фильтр
-- работает только на L2-уровне через master_categories.
--
-- Что делаем:
--   1. Добавляем nullable l2_id и l3_id в master_services (FK на categories)
--   2. Создаём индексы для поиска
--   3. Best-effort backfill существующих 36 записей:
--      a) если ms.title точно совпадает с categories_l3.name_ru →
--         заполняем l3_id и l2_id из L3
--      b) для остальных — оставляем NULL (они появятся в выдаче без точной
--         категории, но не сломают существующий UI). UI после P0-4 будет
--         требовать l2_id обязательно для всех новых услуг
--
-- Что НЕ делаем (для безопасности):
--   - Колонки nullable, не NOT NULL — старые записи с NULL не упадут
--   - Не удаляем master_services.title — оставляем как human-readable
--     override (мастер может назвать «Установка унитаза Roca из импортных
--     комплектующих», а l3_id будет ссылаться на «Установка унитаза»)
--   - FK ON DELETE SET NULL — если категория удалится, услуга останется
--     с NULL вместо каскадной утраты прайса

-- ============================================================================
-- COLUMNS
-- ============================================================================

ALTER TABLE public.master_services
  ADD COLUMN l2_id text NULL REFERENCES public.categories_l2(id) ON DELETE SET NULL,
  ADD COLUMN l3_id text NULL REFERENCES public.categories_l3(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.master_services.l2_id IS
  'L2 категория услуги. NULL допустим только для legacy-записей до миграции 0056. Все новые INSERT через UI должны заполнять.';
COMMENT ON COLUMN public.master_services.l3_id IS
  'Опциональная конкретная L3 услуга из таксономии. NULL = свободный текст в title (legacy или мастер ввёл свою формулировку через "Добавить свою услугу").';

-- ============================================================================
-- INDEXES для фильтрации в каталоге мастеров и поиске
-- ============================================================================

CREATE INDEX master_services_l2_id_idx ON public.master_services (l2_id) WHERE l2_id IS NOT NULL;
CREATE INDEX master_services_l3_id_idx ON public.master_services (l3_id) WHERE l3_id IS NOT NULL;

-- ============================================================================
-- BACKFILL — best-effort из существующих 36 записей
-- ============================================================================

-- a) Точное совпадение title <-> categories_l3.name_ru (case-insensitive)
UPDATE public.master_services ms
SET l3_id = l3.id,
    l2_id = l3.l2_id
FROM public.categories_l3 l3
WHERE lower(trim(l3.name_ru)) = lower(trim(ms.title))
  AND ms.l3_id IS NULL
  AND l3.is_active = true;

-- b) Если совпадения L3 нет, но мастер имеет ровно одну L2-категорию,
-- backfill l2_id из неё (best-effort — не точная атрибуция, но даёт фильтр).
-- Мастера с >1 L2 пропускаем — точно отнести услугу к одной из них автоматом
-- невозможно, оставляем NULL до P0-4 onboarding-redesign.
UPDATE public.master_services ms
SET l2_id = mc.l2_id
FROM (
  SELECT master_id, MIN(l2_id) AS l2_id
  FROM public.master_categories
  GROUP BY master_id
  HAVING COUNT(*) = 1
) mc
WHERE ms.master_id = mc.master_id
  AND ms.l2_id IS NULL;
