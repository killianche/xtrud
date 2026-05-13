-- 0034_categories_is_featured.sql
-- Sprint J (UI rewrite): featured-вертикали на главной клиента.
--
-- Цель: помечать L2 категории, которые отрисовываются КРУПНЫМИ plate-карточками
-- в hero-зоне главной (зона "Featured" над обычной сеткой). Клининг и срочный
-- ремонт — две приоритетные вертикали по PRODUCT_CONTEXT.md.
--
-- Изменения:
--   - categories_l2.is_featured boolean NOT NULL DEFAULT false
--   - индекс для быстрой выборки featured-карточек
--   - помечаем cleaning + plumbing как featured (последние = "срочный ремонт")
--
-- Безопасно: добавление поля с дефолтом + UPDATE.

ALTER TABLE public.categories_l2
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.categories_l2.is_featured IS
  'Если true — категория отрисовывается на главной клиента в зоне "Featured" крупной plate-карточкой над обычной сеткой.';

-- Индекс под фильтр на главной (типичный запрос с .eq("is_featured", true))
CREATE INDEX IF NOT EXISTS categories_l2_is_featured_idx
  ON public.categories_l2 (is_featured)
  WHERE is_featured = true;

-- Помечаем приоритетные вертикали для старта.
-- cleaning — клининг (уборка/мойка окон/химчистка).
-- plumbing — сантехник как ядро "срочного ремонта" (на главной MVP не делаем
-- L1 категорию "срочный ремонт", показываем самую важную из L2).
UPDATE public.categories_l2
  SET is_featured = true
  WHERE id IN ('cleaning', 'plumbing');
