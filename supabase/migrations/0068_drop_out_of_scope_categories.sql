-- Migration 0068 — удаляем категории вне scope (только ремонт+стройка+быт).
--
-- Решение (фидбек user 2026-05-15): xtrud — нишевый сервис под ремонт,
-- стройку и бытовые услуги. Категории «Авто», «Перевозки», «Бьюти»,
-- «Образование», «События», «Бизнес», «IT», «Личный сервис» — вне scope.
--
-- Оставляем 2 L1 раздела:
--   - construction (Строительство и ремонт) — 12 L2
--   - home-services (Дом и быт, включая клининг) — 7 L2
--
-- Удаляем 8 L1 (47 L2 + связанные L3 + связанные seed-данные).
--
-- Порядок DELETE — важен из-за FK ON DELETE RESTRICT:
--   1. master_categories (RESTRICT на L2) — чистим записи с oos l2_id
--   2. orders (RESTRICT на L2) — чистим, CASCADE подхватит chats / order_responses /
--      reviews связанные с этими orders
--   3. order_responses (RESTRICT на L2) — orphaned после п.2 (если есть)
--   4. reviews (RESTRICT на L2) — orphaned после п.2 (если есть)
--   5. categories_l3 (RESTRICT на L2) — теперь можно удалять L3 в oos L2
--   6. categories_l2 (RESTRICT на L1) — CASCADE снимет category_terms
--   7. categories_l1 — финал
--
-- master_services FK на L2/L3 это SET NULL, поэтому он сам подчистится
-- (мастера потеряют привязку, но услуги останутся в БД с null l2/l3).
-- В seed'е таких записей 0, поэтому реального impact нет.

BEGIN;

-- Список out-of-scope L1
WITH oos_l1 AS (
  SELECT id FROM categories_l1 WHERE id IN (
    'auto', 'transport', 'beauty-health', 'education',
    'events', 'business', 'it-digital', 'personal-services'
  )
),
oos_l2 AS (
  SELECT id FROM categories_l2 WHERE l1_id IN (SELECT id FROM oos_l1)
)
-- 1. master_categories
DELETE FROM public.master_categories WHERE l2_id IN (SELECT id FROM oos_l2);

-- 2. orders (CASCADE на chats / order_responses / reviews по order_id)
WITH oos_l1 AS (
  SELECT id FROM categories_l1 WHERE id IN (
    'auto', 'transport', 'beauty-health', 'education',
    'events', 'business', 'it-digital', 'personal-services'
  )
),
oos_l2 AS (
  SELECT id FROM categories_l2 WHERE l1_id IN (SELECT id FROM oos_l1)
)
DELETE FROM public.orders WHERE l2_id IN (SELECT id FROM oos_l2);

-- 3. order_responses orphaned по l2_id (если что-то осталось)
WITH oos_l1 AS (
  SELECT id FROM categories_l1 WHERE id IN (
    'auto', 'transport', 'beauty-health', 'education',
    'events', 'business', 'it-digital', 'personal-services'
  )
),
oos_l2 AS (
  SELECT id FROM categories_l2 WHERE l1_id IN (SELECT id FROM oos_l1)
)
DELETE FROM public.order_responses WHERE l2_id IN (SELECT id FROM oos_l2);

-- 4. reviews orphaned по l2_id
WITH oos_l1 AS (
  SELECT id FROM categories_l1 WHERE id IN (
    'auto', 'transport', 'beauty-health', 'education',
    'events', 'business', 'it-digital', 'personal-services'
  )
),
oos_l2 AS (
  SELECT id FROM categories_l2 WHERE l1_id IN (SELECT id FROM oos_l1)
)
DELETE FROM public.reviews WHERE l2_id IN (SELECT id FROM oos_l2);

-- 5. categories_l3 в oos L2
WITH oos_l1 AS (
  SELECT id FROM categories_l1 WHERE id IN (
    'auto', 'transport', 'beauty-health', 'education',
    'events', 'business', 'it-digital', 'personal-services'
  )
),
oos_l2 AS (
  SELECT id FROM categories_l2 WHERE l1_id IN (SELECT id FROM oos_l1)
)
DELETE FROM public.categories_l3 WHERE l2_id IN (SELECT id FROM oos_l2);

-- 6. categories_l2 в oos L1 (CASCADE на category_terms по l2_id/l3_id)
DELETE FROM public.categories_l2 WHERE l1_id IN (
  'auto', 'transport', 'beauty-health', 'education',
  'events', 'business', 'it-digital', 'personal-services'
);

-- 7. categories_l1 — сами разделы
DELETE FROM public.categories_l1 WHERE id IN (
  'auto', 'transport', 'beauty-health', 'education',
  'events', 'business', 'it-digital', 'personal-services'
);

COMMIT;
