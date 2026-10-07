-- 0233: общие слова уборки — на «Уборку (клининг)», а не на «Уборку после
-- ремонта» (TASKS №259, снимок владельца 2026-10-07). «Убраться в комнате»
-- предлагал «Уборку после ремонта», «Кузовной ремонт» и «Ремонт и отделку», но
-- не «Уборку (клининг)»: у неё не было ни одного синонима, а «убрать»,
-- «уборка», «клининг», «помыть окна»… (2026-05) висели на уборке после
-- ремонта — тогда отдельной категории клининга ещё не было.
-- У «Уборки после ремонта» остаются «уборка после ремонта» и новое
-- «после ремонта». Откат — 0233_cleaning_terms_to_cleaning_rollback.sql.

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.category_terms
      WHERE l2_id = 'cleaning-post-renovation' AND l3_id IS NULL
        AND term IN ('убрать', 'уборка', 'помыть окна', 'окна помыть', 'генеральная',
                     'клининг', 'химчистка', 'мытьё')) <> 8 THEN
    RAISE EXCEPTION '0233: синонимы уборки после ремонта не совпадают с ожидаемыми';
  END IF;
  IF EXISTS (SELECT 1 FROM public.category_terms WHERE l2_id = 'cleaning') THEN
    RAISE EXCEPTION '0233: у cleaning уже есть синонимы — сверить вручную';
  END IF;
  IF (SELECT count(*) FROM public.categories_l2
      WHERE id IN ('cleaning', 'cleaning-post-renovation') AND is_active) <> 2 THEN
    RAISE EXCEPTION '0233: нет активных cleaning / cleaning-post-renovation';
  END IF;
END $$;

UPDATE public.category_terms SET l2_id = 'cleaning'
 WHERE l2_id = 'cleaning-post-renovation' AND l3_id IS NULL
   AND term IN ('убрать', 'уборка', 'помыть окна', 'окна помыть', 'генеральная',
                'клининг', 'химчистка', 'мытьё');

INSERT INTO public.category_terms (l2_id, term, weight) VALUES
  ('cleaning', 'убраться', 100),
  ('cleaning', 'прибраться', 90),
  ('cleaning', 'уборка квартиры', 100),
  ('cleaning', 'уборщица', 90),
  ('cleaning-post-renovation', 'после ремонта', 90);

COMMIT;
