-- Трендовые бытовые услуги в существующие категории.
--
-- DECISION владельца 2026-09-03 по скриншотам Яндекс.Услуг: «то, что является
-- трендом и не будет утяжелять приложение, добавь как услугу».
--
-- Ключевое слово — «как услугу». Новых категорий не заводим: каталог и так
-- содержит 43 категории, а каждая новая — это ещё одна строка на главной и
-- ещё один выбор для человека (design-quality §1.1). Всё, что перечислено на
-- скриншотах, кладётся внутрь уже видимых категорий.
--
-- Три позиции со скриншотов СЮДА НЕ ПОПАЛИ, потому что им честно некуда:
-- «Химчистка мебели», «Глажка одежды», «Дезинсекция». Их место — раздел
-- «Дом и быт», который сейчас скрыт целиком (7 категорий, 0 услуг). Класть
-- химчистку дивана в «Ремонт бытовой техники» только ради галочки — это
-- врать человеку о структуре каталога. Решение по разделу — за владельцем.
--
-- Идентификаторы услуг — латиницей, как у остальных 291 записи.
-- ON CONFLICT DO NOTHING: миграция повторяемая.

BEGIN;

INSERT INTO public.categories_l3 (id, l2_id, name_ru, urgency_typical, sort_order) VALUES
  -- Бытовая техника: самая частая бытовая нужда после сантехники.
  ('appliance-install',        'appliance-repair', 'Установка бытовой техники', 'week',  50),
  ('washing-machine-repair',   'appliance-repair', 'Ремонт стиральных машин',   'urgent', 51),
  ('fridge-repair',            'appliance-repair', 'Ремонт холодильников',      'urgent', 52),
  ('dishwasher-repair',        'appliance-repair', 'Ремонт посудомоечных машин','week',   53),
  ('ac-install',               'appliance-repair', 'Установка кондиционера',    'week',   54),
  ('ac-service',               'appliance-repair', 'Чистка и заправка кондиционера', 'week', 55),

  -- Счётчики: сезонный, но постоянно востребованный повод.
  ('water-meter-check',        'plumbing',   'Поверка счётчиков воды',       'week', 50),
  ('water-meter-install',      'plumbing',   'Установка счётчиков воды',     'week', 51),
  ('electric-meter-install',   'electrical', 'Установка электросчётчика',    'week', 50),

  -- Замки: аварийный повод, ищут срочно.
  ('lock-open',                'locks-security', 'Вскрытие замка',            'urgent', 50),
  ('lock-replace',             'locks-security', 'Замена замка',              'urgent', 51),

  -- Вывоз мусора бытовой. Строительный уже есть в «Демонтаже» под id
  -- debris-removal — второй такой же не заводим.
  ('garbage-removal',          'movers',     'Вывоз мусора',                 'week', 50),

  -- Мастер на час: мелкие бытовые задачи одним поводом.
  ('furniture-assembly-home',  'handyman',   'Сборка мебели',                'week', 50),
  ('tv-mount',                 'handyman',   'Повесить телевизор',           'week', 51),
  ('curtain-mount',            'handyman',   'Повесить карниз и шторы',      'week', 52)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_added integer;
BEGIN
  SELECT count(*) INTO v_added FROM public.categories_l3
   WHERE id IN ('appliance-install','washing-machine-repair','fridge-repair',
                'dishwasher-repair','ac-install','ac-service','water-meter-check',
                'water-meter-install','electric-meter-install','lock-open',
                'lock-replace','garbage-removal',
                'furniture-assembly-home','tv-mount','curtain-mount');
  IF v_added <> 15 THEN
    RAISE EXCEPTION 'ожидалось 15 услуг, найдено %', v_added;
  END IF;
  RAISE NOTICE '15 трендовых услуг добавлено в существующие категории.';
END
$$;

COMMIT;
