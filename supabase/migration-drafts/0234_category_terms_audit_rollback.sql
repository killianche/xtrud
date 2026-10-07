-- Откат 0234.

BEGIN;

DELETE FROM public.category_terms
 WHERE l3_id IS NULL AND (
       l2_id IN ('machinery', 'garden', 'laundry', 'pest-control', 'water-sewer')
    OR (l2_id = 'climate-control'
        AND term IN ('вентиляция', 'вытяжка', 'заправка кондиционера', 'чистка кондиционера'))
    OR (l2_id = 'painting'
        AND term IN ('покраска', 'покрасить', 'штукатурка', 'шпаклёвка', 'шпаклевка', 'штукатур',
                     'маляр', 'выравнивание стен', 'побелка')));

UPDATE public.category_terms SET l2_id = 'climate'
 WHERE l2_id = 'climate-control' AND l3_id IS NULL
   AND term IN ('кондиционер', 'сплит', 'сплит-система', 'установка кондиционера');

INSERT INTO public.category_terms (l2_id, term, weight) VALUES
  ('ceilings', 'натяжной потолок', 100),
  ('ceilings', 'натяжные потолки', 100);

COMMIT;
