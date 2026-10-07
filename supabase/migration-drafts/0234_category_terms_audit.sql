-- 0234: проверка синонимов всех категорий после 0233 (TASKS №264, 2026-10-07:
-- «проверь, чтобы такие же ошибки не было в других категориях»).
--
-- Та же ошибка, что с уборкой: слова про кондиционеры («кондиционер»,
-- «сплит», «установка кондиционера») висели на «Отоплении и котлах», а у
-- «Кондиционеров и вентиляции» не было ни одного синонима — «установить
-- кондиционер» уводил к котлам. «Натяжной потолок» был и у «Подвесных
-- потолков», и у «Натяжных» — остаётся у натяжных.
-- Без синонимов было ещё шесть подкатегорий (спецтехника, сад, стирка,
-- дезинсекция, водоснабжение, кондиционеры), у «Штукатурки и покраски» —
-- одно слово. Слова взяты из названий их услуг (categories_l3).
-- Откат — 0234_category_terms_audit_rollback.sql.

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.category_terms
      WHERE l2_id = 'climate' AND l3_id IS NULL
        AND term IN ('кондиционер', 'сплит', 'сплит-система', 'установка кондиционера')) <> 4 THEN
    RAISE EXCEPTION '0234: синонимы кондиционеров у climate не совпадают с ожидаемыми';
  END IF;
  IF (SELECT count(*) FROM public.category_terms
      WHERE l2_id = 'ceilings' AND term IN ('натяжной потолок', 'натяжные потолки')) <> 2 THEN
    RAISE EXCEPTION '0234: дубли натяжных потолков у ceilings не совпадают с ожидаемыми';
  END IF;
  IF EXISTS (SELECT 1 FROM public.category_terms
             WHERE l2_id IN ('climate-control', 'machinery', 'garden', 'laundry',
                             'pest-control', 'water-sewer')) THEN
    RAISE EXCEPTION '0234: у пустых подкатегорий уже есть синонимы — сверить вручную';
  END IF;
  IF (SELECT count(*) FROM public.categories_l2
      WHERE is_active AND id IN ('climate-control', 'machinery', 'garden', 'laundry',
                                 'pest-control', 'water-sewer', 'painting')) <> 7 THEN
    RAISE EXCEPTION '0234: не все подкатегории активны';
  END IF;
END $$;

UPDATE public.category_terms SET l2_id = 'climate-control'
 WHERE l2_id = 'climate' AND l3_id IS NULL
   AND term IN ('кондиционер', 'сплит', 'сплит-система', 'установка кондиционера');

DELETE FROM public.category_terms
 WHERE l2_id = 'ceilings' AND term IN ('натяжной потолок', 'натяжные потолки');

INSERT INTO public.category_terms (l2_id, term, weight) VALUES
  ('climate-control', 'вентиляция', 100),
  ('climate-control', 'вытяжка', 90),
  ('climate-control', 'заправка кондиционера', 100),
  ('climate-control', 'чистка кондиционера', 100),
  ('machinery', 'спецтехника', 100),
  ('machinery', 'экскаватор', 100),
  ('machinery', 'погрузчик', 90),
  ('machinery', 'манипулятор', 90),
  ('machinery', 'самосвал', 90),
  ('machinery', 'автовышка', 90),
  ('machinery', 'ямобур', 80),
  ('machinery', 'бетононасос', 80),
  ('machinery', 'трактор', 80),
  ('garden', 'покос травы', 100),
  ('garden', 'покосить траву', 100),
  ('garden', 'скосить траву', 90),
  ('garden', 'спилить дерево', 100),
  ('garden', 'спил дерева', 90),
  ('garden', 'обрезка деревьев', 90),
  ('garden', 'сад', 80),
  ('garden', 'огород', 80),
  ('garden', 'вскопать огород', 80),
  ('laundry', 'стирка', 100),
  ('laundry', 'постирать', 100),
  ('laundry', 'глажка белья', 80),
  ('laundry', 'химчистка одежды', 90),
  ('laundry', 'ремонт обуви', 80),
  ('pest-control', 'тараканы', 100),
  ('pest-control', 'клопы', 100),
  ('pest-control', 'дезинсекция', 100),
  ('pest-control', 'дезинфекция', 90),
  ('pest-control', 'дератизация', 90),
  ('pest-control', 'крысы', 90),
  ('pest-control', 'мыши', 80),
  ('pest-control', 'плесень', 80),
  ('water-sewer', 'септик', 100),
  ('water-sewer', 'откачка септика', 100),
  ('water-sewer', 'ассенизатор', 90),
  ('water-sewer', 'выгребная яма', 90),
  ('water-sewer', 'замена труб', 90),
  ('water-sewer', 'разводка труб', 90),
  ('water-sewer', 'прорыв трубы', 90),
  ('water-sewer', 'насосная станция', 80),
  ('painting', 'покраска', 100),
  ('painting', 'покрасить', 100),
  ('painting', 'штукатурка', 100),
  ('painting', 'шпаклёвка', 100),
  ('painting', 'шпаклевка', 90),
  ('painting', 'штукатур', 90),
  ('painting', 'маляр', 90),
  ('painting', 'выравнивание стен', 90),
  ('painting', 'побелка', 80);

COMMIT;
