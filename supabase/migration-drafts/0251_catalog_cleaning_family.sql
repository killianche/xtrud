-- 0251: «Уборка» отдельно, «Няни и сиделки» — свой раздел (№330, 2026-10-08).
--
-- Владелец, 2026-10-08: «Уборка и помощь по хозяйству — раздел, и в него
-- входит вывоз мусора… Няни и сиделки — почему там? Уборка — отдельная
-- категория. Няни — отдельно. Посмотри, как у Авито, Яндекс Исполнителей,
-- TaskRabbit, и сделай как лучше».
--
-- Референсы (2026-10-08): Яндекс Исполнители — «Вывоз мусора» в «Перевозках
-- и курьерах» (uslugi.yandex.ru/…/perevozki-i-kureryi/vyivoz-musora),
-- химчистка и глажка — в «Хозяйстве и уборке»; TaskRabbit — Cleaning
-- отдельным разделом, вывоз мусора в Moving, Yardwork отдельно; Авито —
-- плитка «Уборка» отдельно; нянь к уборке не кладёт никто. Разбор —
-- docs/CATALOG_RESTRUCTURE_2026-10-08.md.
--
-- Только данные каталога. id подкатегорий не меняются — задания
-- (orders.l2_id) и категории специалистов (master_categories.l2_id) уходят
-- вместе с подкатегорией. Схема, функции, права не трогаются.
--
-- Было → стало:
--   home-services «Уборка и помощь по хозяйству» → «Уборка»: cleaning,
--     housekeeping, cleaning-post-renovation, laundry («Стирка и чистка» →
--     «Стирка и химчистка»), pest-control;
--   disposal «Вывоз мусора» → раздел cargo, сразу после «Грузоперевозок»;
--   garden «Сад и участок» → раздел construction рядом с «Благоустройством»,
--     имя «Сад и огород» (слово «участок» уже в названии раздела);
--   caregivers «Няни и сиделки» → новый раздел family-care «Няни и
--     сиделки» (иконка Baby, после «Компьютерной помощи»).
--
-- Откат: 0251_catalog_cleaning_family_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0251_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories_l1 WHERE id = 'family-care') THEN
    RAISE EXCEPTION '0251_already_applied';
  END IF;
  IF (SELECT count(*) FROM public.categories_l2
       WHERE (id, l1_id, name_ru) IN (('disposal', 'home-services', 'Вывоз мусора'),
                                      ('garden', 'home-services', 'Сад и участок'),
                                      ('caregivers', 'home-services', 'Няни и сиделки'),
                                      ('laundry', 'home-services', 'Стирка и чистка'))) <> 4
     OR (SELECT name_ru FROM public.categories_l1 WHERE id = 'home-services')
        IS DISTINCT FROM 'Уборка и помощь по хозяйству' THEN
    RAISE EXCEPTION '0251_catalog_changed';
  END IF;
END;
$$;

UPDATE public.categories_l1 SET name_ru = 'Уборка' WHERE id = 'home-services';

INSERT INTO public.categories_l1 (id, name_ru, icon, sort_order, is_active)
VALUES ('family-care', 'Няни и сиделки', 'Baby', 115, true);

UPDATE public.categories_l2 SET l1_id = 'cargo', sort_order = 25 WHERE id = 'disposal';
UPDATE public.categories_l2 SET l1_id = 'construction', sort_order = 275, name_ru = 'Сад и огород'
 WHERE id = 'garden';
UPDATE public.categories_l2 SET l1_id = 'family-care', sort_order = 10 WHERE id = 'caregivers';
UPDATE public.categories_l2 SET name_ru = 'Стирка и химчистка' WHERE id = 'laundry';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories_l2
              WHERE l1_id = 'home-services'
                AND id IN ('disposal', 'garden', 'caregivers'))
     OR (SELECT count(*) FROM public.categories_l2 WHERE l1_id = 'home-services' AND is_active) <> 5
     OR (SELECT count(*) FROM public.categories_l2 WHERE l1_id = 'family-care') <> 1 THEN
    RAISE EXCEPTION '0251_check';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
