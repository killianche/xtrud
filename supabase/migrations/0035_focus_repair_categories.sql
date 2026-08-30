-- 0035_focus_repair_categories.sql
-- Sprint J — сузить продукт до ремонта/стройки + домашняя уборка.
--
-- Решение пользователя: «У нас мастера по ремонту. Остальное не надо.
-- Только то что относится к ремонту и стройке.» Cleaning оставляем как
-- отдельную вертикаль (уже featured).
--
-- Что было видимо на главной (10+ категорий из разных L1):
--   construction: general-construction, finishing, electrical, plumbing,
--                 windows-doors, ceilings
--   home-services: cleaning
--   auto:    auto-service, tire-service, body-paint, car-wash, roadside
--   transport: cargo, heavy-equipment
--   beauty:   nails, lashes-brows, hair, cosmetology, massage, stylist, home-medical
--   education: school-subjects, exam-prep, languages, religious-education
--   events:   catering
--
-- Что останется видимым после миграции (focused на ремонт/стройку):
--   construction:  general-construction, finishing, electrical, plumbing,
--                  windows-doors, ceilings,
--                  + welding (сварка — relevant к стройке)
--                  + climate (кондиционеры — наш hero-пример)
--                  + handyman (малые работы по дому, «мастер на час»)
--                  + furniture (сборка мебели)
--   home-services: cleaning (featured)
--
-- Всё остальное → is_visible = false. Категории остаются в БД и могут быть
-- включены обратно одним UPDATE если решение пересмотрят.

-- 1. Скрываем все категории, которые не относятся к ремонту/стройке/клинингу.
UPDATE public.categories_l2 SET is_visible = false
WHERE id NOT IN (
  'general-construction',
  'finishing',
  'electrical',
  'plumbing',
  'windows-doors',
  'ceilings',
  'welding',
  'climate',
  'handyman',
  'furniture',
  'cleaning'
);

-- 2. Возвращаем видимость для подкатегорий стройки, которые были скрыты ранее.
UPDATE public.categories_l2 SET is_visible = true
WHERE id IN (
  'welding',
  'climate',
  'handyman',
  'furniture'
);

-- 3. Sanity-check (для логов):
DO $$
DECLARE visible_count int;
BEGIN
  SELECT count(*) INTO visible_count FROM public.categories_l2 WHERE is_visible = true;
  RAISE NOTICE 'is_visible=true categories: %', visible_count;
END $$;
