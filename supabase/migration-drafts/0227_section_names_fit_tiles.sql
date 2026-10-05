-- 0227: названия разделов, которые не помещались в плитку в три колонки
-- (2026-10-05, снимки №239). При ширине плитки ~97 pt слова «Грузоперевозки»
-- и «бухгалтерская» (13 pt) рвались посреди слова: «Грузоперевозк / и».
-- Объединённый в 0226 раздел — «Перевозки и доставка» (категория
-- «Грузоперевозки» внутри остаётся); юридический — «Юристы и бухгалтеры»,
-- как у YouDo. Откат — 0227_section_names_fit_tiles_rollback.sql.

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.categories_l1
      WHERE (id = 'cargo' AND name_ru = 'Грузоперевозки и доставка')
         OR (id = 'legal-accounting' AND name_ru = 'Юридическая и бухгалтерская помощь')) <> 2 THEN
    RAISE EXCEPTION '0227: названия разделов не совпадают с ожидаемыми';
  END IF;
END $$;

UPDATE public.categories_l1 SET name_ru = 'Перевозки и доставка' WHERE id = 'cargo';
UPDATE public.categories_l1 SET name_ru = 'Юристы и бухгалтеры' WHERE id = 'legal-accounting';

COMMIT;
