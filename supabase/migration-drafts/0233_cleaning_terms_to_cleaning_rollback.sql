-- Откат 0233.

BEGIN;

DELETE FROM public.category_terms
 WHERE (l2_id = 'cleaning' AND term IN ('убраться', 'прибраться', 'уборка квартиры', 'уборщица'))
    OR (l2_id = 'cleaning-post-renovation' AND term = 'после ремонта');

UPDATE public.category_terms SET l2_id = 'cleaning-post-renovation'
 WHERE l2_id = 'cleaning' AND l3_id IS NULL
   AND term IN ('убрать', 'уборка', 'помыть окна', 'окна помыть', 'генеральная',
                'клининг', 'химчистка', 'мытьё');

COMMIT;
