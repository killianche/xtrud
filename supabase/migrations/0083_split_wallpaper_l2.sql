-- Migration 0083 — выделить «Обои» в отдельную L2 категорию из painting.
--
-- Why. User feedback 2026-05-16: «почему нет Обои??» — при поиске «обои»
-- top-hit показывает L2 «Штукатурка, шпаклёвка, покраска» с бейджем
-- «Категория», но пользователь ожидает literal-категорию «Обои».
--
-- Эталон. Profi.ru, Avito Услуги: «Поклейка обоев» — отдельная top-level
-- service category, не сабкатегория малярки. Мастер-обойщик != мастер-маляр,
-- хотя пересекаются.
--
-- Что меняется:
--   1. Создаётся новая L2 'wallpaper' с name_ru = 'Обои'.
--   2. 8 существующих L3 wallpaper-* переезжают из l2_id='painting' в 'wallpaper':
--      wallpaper-paper, wallpaper-vinyl, wallpaper-paintable, wallpaper-fleece,
--      wallpaper-photo, wallpaper-liquid, wallpaper-removal, wallpaper-repair.
--   3. Synonyms обои-тематики переезжают с painting → wallpaper:
--      'обои', 'оклейка', 'переклеить', 'поклеить обои'.
--   4. painting сохраняется. Его name_ru тоже сокращается с
--      «Штукатурка, шпаклёвка, покраска» → «Штукатурка и покраска» (короче,
--      обоев больше нет внутри).
--
-- НЕ трогаем:
--   - master_categories: мастера, выбравшие painting, остаются там. Если они
--     ещё и обойщики — добавят wallpaper вручную через UI.
--   - master_services: 0 строк с wallpaper-* l3_id (проверено).
--   - orders/reviews с l2_id='painting': 2 заказа и 1 отзыв. Один из заказов
--     по title явно про обои («Поклеить обои в зале»), но автоматическая
--     реклассификация по тексту небезопасна — оставляем как posted.

-- ============================================================================
-- 1. Новая L2 'wallpaper' = Обои
-- ============================================================================

INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_active, is_visible, is_featured)
VALUES ('wallpaper', 'construction', 'Обои', 'Paintbrush', 105, true, true, false);

-- ============================================================================
-- 2. Переезд L3 wallpaper-* из painting → wallpaper
-- ============================================================================

UPDATE public.categories_l3
SET l2_id = 'wallpaper'
WHERE id IN (
  'wallpaper-paper',
  'wallpaper-vinyl',
  'wallpaper-paintable',
  'wallpaper-fleece',
  'wallpaper-photo',
  'wallpaper-liquid',
  'wallpaper-removal',
  'wallpaper-repair'
);

-- ============================================================================
-- 3. Переезд synonyms обои-тематики (L2-уровень) painting → wallpaper
-- ============================================================================

UPDATE public.category_terms
SET l2_id = 'wallpaper'
WHERE l2_id = 'painting'
  AND term IN ('обои', 'оклейка', 'переклеить', 'поклеить обои');

-- Дополнительные synonyms для wallpaper (более полное покрытие):
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('поклейка',          'wallpaper', 100),
  ('поклеить',          'wallpaper', 100),
  ('наклеить обои',     'wallpaper', 100),
  ('обойщик',           'wallpaper', 100),
  ('фотообои',          'wallpaper', 100),
  ('флизелин',          'wallpaper', 100),
  ('флизелиновые',      'wallpaper', 100);

-- ============================================================================
-- 4. Сократить name_ru у painting (убрать упоминание обоев — их больше нет внутри)
-- ============================================================================

UPDATE public.categories_l2
SET name_ru = 'Штукатурка и покраска'
WHERE id = 'painting';

COMMENT ON TABLE public.categories_l2 IS
  'L2 (подкатегории). Sprint 0083 (2026-05-16): wallpaper выделена из painting в отдельную L2.';
