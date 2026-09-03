-- Раздел «Дом и быт» открывается: пять категорий с наполнением.
--
-- DECISION владельца 2026-09-03: «открой дом и быт».
--
-- Состояние до правки (FACT): раздел числился в продукте, но был невидим
-- целиком — 7 категорий, ни одной услуги. Человек не мог найти ни уборку,
-- ни вывоз мусора: бытовые нужды обслуживались случайными позициями из
-- раздела стройки.
--
-- Открываем ПЯТЬ категорий, а не семь. Две оставляем скрытыми осознанно:
--   * «Бытовая техника» дублирует видимую «Ремонт бытовой техники»
--     (11 услуг, и туда же 2026-09-03 добавлены установка техники,
--     стиральные машины, холодильники, посудомойки, кондиционеры);
--   * «Спутник, ТВ и интернет» дублирует видимую «Спутниковое ТВ и антенны».
-- Две категории с одинаковым смыслом в одном каталоге — это не богатство
-- выбора, а вопрос «а в чём разница?» на каждом экране (design-quality §1.1).
--
-- Услуги написаны под республику: без франшиз, клинингов «под ключ» и прочего
-- городского маркетинга. Названия — то, как люди формулируют задачу вслух.
--
-- Иконка «Утилизации» меняется с Trash2 на Truck: вывоз — это про машину, а
-- не про урну, и Truck уже есть в наборе. Bug и Trash2 добавлены в
-- src/lib/category-icons.ts этой же правкой (проверено: обе есть в lucide).

BEGIN;

-- ── 1. Открываем пять категорий ─────────────────────────────────────────────
UPDATE public.categories_l2
   SET is_visible = true
 WHERE id IN ('cleaning', 'laundry', 'disposal', 'garden', 'pest-control');

-- ── 2. Услуги ───────────────────────────────────────────────────────────────
INSERT INTO public.categories_l3 (id, l2_id, name_ru, urgency_typical, sort_order) VALUES
  -- Клининг: самое частое — обычная уборка и окна.
  ('apartment-cleaning',    'cleaning', 'Уборка квартиры',            'week',   1),
  ('general-cleaning',      'cleaning', 'Генеральная уборка',         'week',   2),
  ('window-cleaning',       'cleaning', 'Мытьё окон',                 'week',   3),
  ('house-cleaning',        'cleaning', 'Уборка дома',                'week',   4),
  ('office-cleaning',       'cleaning', 'Уборка офиса или магазина',  'week',   5),
  ('sofa-dry-cleaning',     'cleaning', 'Химчистка мебели',           'week',   6),
  ('carpet-dry-cleaning',   'cleaning', 'Химчистка ковров',           'week',   7),
  ('after-party-cleaning',  'cleaning', 'Уборка после мероприятия',   'urgent', 8),

  -- Стирка и чистка: вещи, которые везут или забирают.
  ('laundry-service',       'laundry',  'Стирка белья',               'week', 1),
  ('ironing',               'laundry',  'Глажка одежды и белья',      'week', 2),
  ('curtains-cleaning',     'laundry',  'Стирка штор и тюля',         'week', 3),
  ('outerwear-cleaning',    'laundry',  'Химчистка верхней одежды',   'week', 4),
  ('shoe-repair-clean',     'laundry',  'Чистка и ремонт обуви',      'week', 5),

  -- Утилизация и вывоз: почти всегда «надо было вчера».
  ('old-furniture-removal', 'disposal', 'Вывоз старой мебели',        'week',   2),
  ('appliance-removal',     'disposal', 'Вывоз старой техники',       'week',   3),
  ('branches-removal',      'disposal', 'Вывоз веток и травы',        'week',   4),
  ('junk-clearing',         'disposal', 'Расчистка двора или гаража', 'week',   5),

  -- Сад и участок: сезонная, но постоянная работа.
  ('grass-mowing',          'garden',   'Покос травы',                'urgent', 1),
  ('tree-trimming',         'garden',   'Обрезка деревьев и кустов',  'week',   2),
  ('tree-felling',          'garden',   'Спил дерева',                'week',   3),
  ('lawn-care',             'garden',   'Посадка и уход за газоном',  'month',  4),
  ('yard-cleanup',          'garden',   'Уборка участка',             'week',   5),
  ('watering-system',       'garden',   'Полив и капельный полив',    'month',  6),

  -- Дезинфекция: ищут срочно и почти всегда по вредителю.
  ('pest-insects',          'pest-control', 'Обработка от насекомых',     'urgent', 1),
  ('pest-bedbugs',          'pest-control', 'Обработка от клопов',        'urgent', 2),
  ('pest-cockroaches',      'pest-control', 'Обработка от тараканов',     'urgent', 3),
  ('pest-rodents',          'pest-control', 'Борьба с грызунами',         'urgent', 4),
  ('disinfection',          'pest-control', 'Дезинфекция помещения',      'week',   5),
  ('mold-treatment',        'pest-control', 'Обработка от плесени',       'week',   6)
ON CONFLICT (id) DO NOTHING;

-- ── 3. «Вывоз мусора» переезжает к утилизации ───────────────────────────────
-- 2026-09-03 услуга была добавлена в «Грузчиков и переезды» — тогда своей
-- категории у неё не было. Теперь есть, и место у неё там. Мастеров на этой
-- услуге нет (добавлена в тот же день), поэтому перенос никого не задевает.
UPDATE public.categories_l3
   SET l2_id = 'disposal', sort_order = 1
 WHERE id = 'garbage-removal';

-- ── 4. Иконка вывоза ────────────────────────────────────────────────────────
UPDATE public.categories_l2 SET icon = 'Truck' WHERE id = 'disposal';

-- ── Проверки ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_visible integer;
  v_empty   integer;
BEGIN
  SELECT count(*) INTO v_visible
    FROM public.categories_l2
   WHERE l1_id = 'home-services' AND is_visible AND is_active;
  IF v_visible <> 5 THEN
    RAISE EXCEPTION 'ожидалось 5 видимых категорий в «Дом и быт», получено %', v_visible;
  END IF;

  -- Открытая категория без услуг — тупик: человек заходит и упирается в пустоту.
  SELECT count(*) INTO v_empty
    FROM public.categories_l2 l2
   WHERE l2.l1_id = 'home-services' AND l2.is_visible AND l2.is_active
     AND NOT EXISTS (SELECT 1 FROM public.categories_l3 l3 WHERE l3.l2_id = l2.id);
  IF v_empty > 0 THEN
    RAISE EXCEPTION 'открытых категорий без услуг: %', v_empty;
  END IF;

  RAISE NOTICE 'Раздел «Дом и быт» открыт: 5 категорий, все с услугами.';
END
$$;

COMMIT;
