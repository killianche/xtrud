-- Откат 0251: прежняя «Уборка и помощь по хозяйству» с восемью подкатегориями.

BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.categories_l2 SET l1_id = 'home-services', sort_order = 50 WHERE id = 'disposal';
UPDATE public.categories_l2 SET l1_id = 'home-services', sort_order = 60, name_ru = 'Сад и участок'
 WHERE id = 'garden';
UPDATE public.categories_l2 SET l1_id = 'home-services', sort_order = 80 WHERE id = 'caregivers';
UPDATE public.categories_l2 SET name_ru = 'Стирка и чистка' WHERE id = 'laundry';
DELETE FROM public.categories_l1 WHERE id = 'family-care';
UPDATE public.categories_l1 SET name_ru = 'Уборка и помощь по хозяйству' WHERE id = 'home-services';

NOTIFY pgrst, 'reload schema';

COMMIT;
