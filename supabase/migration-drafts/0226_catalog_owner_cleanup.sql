-- 0226: каталог по указанию владельца (2026-10-05, №239).
--
-- DECISION владельца: «Красота и здоровье», «Мероприятия и промоакции»,
-- «Виртуальный помощник», «Фото, видео и аудио» — удалить полностью;
-- «Компьютерная помощь» — только раздел, без подкатегорий; «Курьерские
-- услуги» и «Грузоперевозки» объединить; «Клининг» → «Уборка (клининг)»;
-- из «Строительство и участок» убрать «Стройматериалы (доставка)»; в «Мебель
-- и интерьер» — натяжные и подвесные потолки.
--
-- FACT (live, 2026-10-05): на удаляемые категории и услуги нет ни заказов
-- (l2_id, extra_l2_ids, l3_ids), ни откликов, ни отзывов, ни специалистов
-- (master_categories, master_services), ни статей. Поэтому строки удаляются,
-- а не выключаются. Проверка ниже повторяет это в транзакции: если ссылка
-- появилась — миграция падает целиком. Откат — 0226_catalog_owner_cleanup_rollback.sql.

BEGIN;

CREATE TEMP TABLE _gone_l2 ON COMMIT DROP AS
SELECT id FROM public.categories_l2
WHERE l1_id IN ('beauty', 'events', 'photo-video', 'virtual-assistant')
   OR id IN ('materials-delivery', 'software-setup', 'internet-setup', 'phone-repair');

CREATE TEMP TABLE _gone_l3 ON COMMIT DROP AS
SELECT id FROM public.categories_l3
WHERE l2_id IN (
    SELECT id FROM public.categories_l2
    WHERE l1_id IN ('beauty', 'events', 'photo-video', 'virtual-assistant') OR id = 'materials-delivery'
  )
   OR id = 'ceiling-paint';

DO $$
DECLARE
  refs bigint;
BEGIN
  IF (SELECT count(*) FROM public.categories_l1
      WHERE id IN ('beauty', 'events', 'photo-video', 'virtual-assistant', 'courier',
                   'cargo', 'computer-help', 'interior', 'construction')) <> 9 THEN
    RAISE EXCEPTION '0226: разделы каталога не совпадают с ожидаемыми';
  END IF;
  IF (SELECT count(*) FROM public.categories_l2
      WHERE id IN ('pc-repair', 'software-setup', 'internet-setup', 'phone-repair', 'cleaning',
                   'materials-delivery', 'ceilings', 'tension-ceilings')) <> 8 THEN
    RAISE EXCEPTION '0226: категории каталога не совпадают с ожидаемыми';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories_l3 WHERE id = 'paint-ceiling' AND l2_id = 'painting') THEN
    RAISE EXCEPTION '0226: нет услуги paint-ceiling в painting';
  END IF;

  SELECT
      (SELECT count(*) FROM public.orders WHERE l2_id IN (SELECT id FROM _gone_l2))
    + (SELECT count(*) FROM public.orders
        WHERE extra_l2_ids && (SELECT coalesce(array_agg(id), '{}') FROM _gone_l2))
    + (SELECT count(*) FROM public.orders
        WHERE l3_ids && (SELECT coalesce(array_agg(id), '{}') FROM _gone_l3))
    + (SELECT count(*) FROM public.order_responses WHERE l2_id IN (SELECT id FROM _gone_l2))
    + (SELECT count(*) FROM public.reviews WHERE l2_id IN (SELECT id FROM _gone_l2))
    + (SELECT count(*) FROM public.master_categories WHERE l2_id IN (SELECT id FROM _gone_l2))
    + (SELECT count(*) FROM public.master_categories
        WHERE l3_ids && (SELECT coalesce(array_agg(id), '{}') FROM _gone_l3))
    + (SELECT count(*) FROM public.master_services
        WHERE l2_id IN (SELECT id FROM _gone_l2) OR l3_id IN (SELECT id FROM _gone_l3))
    + (SELECT count(*) FROM public.articles
        WHERE category_l1_id IN ('beauty', 'events', 'photo-video', 'virtual-assistant', 'courier'))
  INTO refs;
  IF refs <> 0 THEN
    RAISE EXCEPTION '0226: на удаляемый каталог есть ссылки (%), удаление отменено', refs;
  END IF;
END $$;

-- 1. Четыре раздела — полностью: слова поиска, услуги, категории, раздел.
DELETE FROM public.category_terms
WHERE l2_id IN (SELECT id FROM public.categories_l2
                WHERE l1_id IN ('beauty', 'events', 'photo-video', 'virtual-assistant'))
   OR l3_id IN (SELECT t.id FROM public.categories_l3 t JOIN public.categories_l2 c ON c.id = t.l2_id
                WHERE c.l1_id IN ('beauty', 'events', 'photo-video', 'virtual-assistant'));
DELETE FROM public.categories_l3
WHERE l2_id IN (SELECT id FROM public.categories_l2
                WHERE l1_id IN ('beauty', 'events', 'photo-video', 'virtual-assistant'));
DELETE FROM public.categories_l2
WHERE l1_id IN ('beauty', 'events', 'photo-video', 'virtual-assistant');
DELETE FROM public.categories_l1
WHERE id IN ('beauty', 'events', 'photo-video', 'virtual-assistant');

-- 2. «Компьютерная помощь» — одна категория. Услуги трёх соседних
-- переезжают в pc-repair (остаются уточнением в задании), слова поиска —
-- туда же; повторы слов не переносятся.
UPDATE public.categories_l3 SET l2_id = 'pc-repair', sort_order = sort_order + 100
WHERE l2_id = 'software-setup';
UPDATE public.categories_l3 SET l2_id = 'pc-repair', sort_order = sort_order + 200
WHERE l2_id = 'internet-setup';
UPDATE public.categories_l3 SET l2_id = 'pc-repair', sort_order = sort_order + 300
WHERE l2_id = 'phone-repair';
DELETE FROM public.category_terms t
WHERE t.l2_id IN ('software-setup', 'internet-setup', 'phone-repair')
  AND EXISTS (SELECT 1 FROM public.category_terms p
              WHERE p.l2_id = 'pc-repair' AND lower(p.term) = lower(t.term));
DELETE FROM public.category_terms t
WHERE t.l2_id IN ('software-setup', 'internet-setup', 'phone-repair')
  AND t.id NOT IN (SELECT DISTINCT ON (lower(term)) id FROM public.category_terms
                   WHERE l2_id IN ('software-setup', 'internet-setup', 'phone-repair')
                   ORDER BY lower(term), weight DESC, id);
UPDATE public.category_terms SET l2_id = 'pc-repair'
WHERE l2_id IN ('software-setup', 'internet-setup', 'phone-repair');
DELETE FROM public.categories_l2 WHERE id IN ('software-setup', 'internet-setup', 'phone-repair');
UPDATE public.categories_l2 SET name_ru = 'Компьютерная помощь' WHERE id = 'pc-repair';

-- 3. Курьерские услуги входят в грузоперевозки.
UPDATE public.categories_l2 SET l1_id = 'cargo', sort_order = sort_order + 30
WHERE l1_id = 'courier';
UPDATE public.categories_l1 SET name_ru = 'Грузоперевозки и доставка' WHERE id = 'cargo';
DELETE FROM public.categories_l1 WHERE id = 'courier';

-- 4. Клининг.
UPDATE public.categories_l2 SET name_ru = 'Уборка (клининг)' WHERE id = 'cleaning';

-- 5. Стройматериалы (доставка) — убрать.
DELETE FROM public.category_terms
WHERE l2_id = 'materials-delivery'
   OR l3_id IN (SELECT id FROM public.categories_l3 WHERE l2_id = 'materials-delivery');
DELETE FROM public.categories_l3 WHERE l2_id = 'materials-delivery';
DELETE FROM public.categories_l2 WHERE id = 'materials-delivery';

-- 6. Потолки — в «Мебель и интерьер»: натяжные и подвесные. Покраска и
-- побелка потолка — это покраска, а не подвесной потолок: дубль услуги
-- painting/paint-ceiling забирает побелку в название.
UPDATE public.categories_l2 SET l1_id = 'interior', sort_order = 320 WHERE id = 'tension-ceilings';
UPDATE public.categories_l2 SET l1_id = 'interior', sort_order = 330, name_ru = 'Подвесные потолки'
WHERE id = 'ceilings';
DELETE FROM public.category_terms WHERE l3_id = 'ceiling-paint';
DELETE FROM public.categories_l3 WHERE id = 'ceiling-paint';
UPDATE public.categories_l3 SET name_ru = 'Покраска / побелка потолка' WHERE id = 'paint-ceiling';

COMMIT;
