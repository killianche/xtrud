-- 0042_merge_duplicate_l2_categories.sql
--
-- Sprint J: объединение 3 пар семантически дублирующихся L2-категорий
-- (фидбэк юзера 2026-05-14: «одинаковые категории, надо грамотно объединить»).
--
-- Merge plan:
--   plaster-putty (Штукатурка и шпаклёвка) → painting + переименование в
--                                            «Штукатурка, шпаклёвка, покраска»
--   water-sewer  (Водоснабжение и канализация) → plumbing (Сантехника)
--   glass        (Стеклянные работы)         → windows (Окна и остекление)
--
-- Не трогаем (специализации, не дубли):
--   ceilings vs tension-ceilings, doors vs locks-security, security-systems,
--   concrete vs masonry vs general-construction.
--
-- Откат: см. секцию ROLLBACK в конце файла (закомментирована).

-- 1. Перенести master_categories с deprecated → target.
UPDATE public.master_categories
SET l2_id = 'painting', updated_at = now()
WHERE l2_id = 'plaster-putty'
  AND NOT EXISTS (
    SELECT 1 FROM public.master_categories mc2
    WHERE mc2.master_id = master_categories.master_id AND mc2.l2_id = 'painting'
  );
DELETE FROM public.master_categories WHERE l2_id = 'plaster-putty';

UPDATE public.master_categories
SET l2_id = 'plumbing', updated_at = now()
WHERE l2_id = 'water-sewer'
  AND NOT EXISTS (
    SELECT 1 FROM public.master_categories mc2
    WHERE mc2.master_id = master_categories.master_id AND mc2.l2_id = 'plumbing'
  );
DELETE FROM public.master_categories WHERE l2_id = 'water-sewer';

UPDATE public.master_categories
SET l2_id = 'windows', updated_at = now()
WHERE l2_id = 'glass'
  AND NOT EXISTS (
    SELECT 1 FROM public.master_categories mc2
    WHERE mc2.master_id = master_categories.master_id AND mc2.l2_id = 'windows'
  );
DELETE FROM public.master_categories WHERE l2_id = 'glass';

-- 2. Переименовать painting → теперь покрывает все 3 этапа отделки стен.
UPDATE public.categories_l2
SET name_ru = 'Штукатурка, шпаклёвка, покраска'
WHERE id = 'painting';

-- 3. Скрыть deprecated категории (не удаляем физически — для истории и rollback).
UPDATE public.categories_l2
SET is_visible = false, is_active = false
WHERE id IN ('plaster-putty', 'water-sewer', 'glass');

-- ROLLBACK (только визуальный, master_categories обратно НЕ перенесутся):
-- UPDATE public.categories_l2 SET is_visible = true, is_active = true
--   WHERE id IN ('plaster-putty', 'water-sewer', 'glass');
-- UPDATE public.categories_l2 SET name_ru = 'Покраска и шпаклёвка'
--   WHERE id = 'painting';
