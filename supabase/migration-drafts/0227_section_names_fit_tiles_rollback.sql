-- Откат 0227.

BEGIN;

UPDATE public.categories_l1 SET name_ru = 'Грузоперевозки и доставка' WHERE id = 'cargo';
UPDATE public.categories_l1 SET name_ru = 'Юридическая и бухгалтерская помощь' WHERE id = 'legal-accounting';

COMMIT;
