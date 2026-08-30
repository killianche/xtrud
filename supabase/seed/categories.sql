-- Seed категорий xtrud — L1 (10) + L2 (66) + L3 (262).
--
-- Источник: CATEGORIES_AND_PROFILES.md §1.3 (полное дерево, строки 56-489).
-- avg_check_rub — медианная цена в ₽ (NULL = "по договорённости"/"по тарифу").
--   Unit context (час/м²/чел/мес/км) подразумевается категорией, в схеме не хранится явно
--   (планируется в category_fields метакаталоге, sprint 2).
-- urgency_typical: urgent / week / month — как в доке.
-- requires_license: true для категорий, требующих лицензии (газ, инъекции).
-- seasonality: year_round (default) / wedding_season / summer / winter.
-- icon: имя из lucide-react-native.
-- is_visible на L2: 26 категорий выбраны для MVP-витрины — 13 главных из PROJECT_MAP §5.12
--   плюс все L2 в Auto (5) и в Beauty (7), плюс школьное/языки/религиозное образование.

-- Запускается ИДЕМПОТЕНТНО: при повторном запуске — UPDATE через ON CONFLICT.
-- Это позволяет править названия/цены/иконки в этом файле и переаплаить без чистки данных.

BEGIN;

-- ============================================================================
-- L1 — Уровень 1 (10 крупных сфер)
-- ============================================================================

INSERT INTO public.categories_l1 (id, name_ru, icon, sort_order) VALUES
  ('construction',       'Строительство и ремонт',  'Hammer',        1),
  ('home-services',      'Дом и быт',               'Home',          2),
  ('auto',               'Авто и техника',          'Car',           3),
  ('transport',          'Перевозки и спецтехника', 'Truck',         4),
  ('beauty-health',      'Бьюти и здоровье',        'Scissors',      5),
  ('education',          'Образование',             'GraduationCap', 6),
  ('events',             'События и торжества',     'PartyPopper',   7),
  ('business',           'Бизнес и финансы',        'Briefcase',     8),
  ('it-digital',         'IT и цифровое',           'Monitor',       9),
  ('personal-services',  'Личный сервис',           'Heart',        10)
ON CONFLICT (id) DO UPDATE SET
  name_ru = EXCLUDED.name_ru,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- L2 — Уровень 2 (66 категорий)
-- is_visible: true для 26 категорий MVP-витрины.
-- ============================================================================

INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_visible, is_active) VALUES
  -- L1.1 Строительство и ремонт (12)
  ('general-construction',     'construction', 'Общестроительные работы',      'HardHat',      1, true,  true),
  ('finishing',                'construction', 'Отделочные работы',            'Paintbrush',   2, true,  true),
  ('electrical',               'construction', 'Электрика',                    'Zap',          3, true,  true),
  ('plumbing',                 'construction', 'Сантехника',                   'Droplet',      4, true,  true),
  ('windows-doors',            'construction', 'Окна, двери, конструкции',     'DoorOpen',     5, true,  true),
  ('ceilings',                 'construction', 'Потолки',                      'Square',       6, true,  true),
  ('welding',                  'construction', 'Сварка',                       'Flame',        7, false, true),
  ('climate',                  'construction', 'Климат',                       'Wind',         8, false, true),
  ('decorative-installations', 'construction', 'Декоративные покрытия',        'Sparkles',     9, false, true),
  ('furniture',                'construction', 'Мебель',                       'Armchair',    10, false, true),
  ('handyman',                 'construction', 'Малые работы по дому',         'Wrench',      11, false, true),
  ('materials-delivery',       'construction', 'Стройматериалы (доставка)',    'PackageOpen', 12, false, true),

  -- L1.2 Дом и быт (7)
  ('cleaning',     'home-services', 'Клининг',                                  'Sparkles',     1, true,  true),
  ('laundry',      'home-services', 'Стирка и чистка',                          'Droplets',     2, false, true),
  ('disposal',     'home-services', 'Утилизация и вывоз',                       'Trash2',       3, false, true),
  ('garden',       'home-services', 'Сад и участок',                            'Trees',        4, false, true),
  ('tv-internet',  'home-services', 'Спутник, ТВ и интернет',                   'Antenna',      5, false, true),
  ('pest-control', 'home-services', 'Дезинфекция и борьба с вредителями',       'Bug',          6, false, true),
  ('appliances',   'home-services', 'Бытовая техника',                          'Refrigerator', 7, false, true),

  -- L1.3 Авто и техника (5) — все visible
  ('auto-service', 'auto', 'СТО общее',                  'Wrench',     1, true, true),
  ('tire-service', 'auto', 'Шиномонтаж',                 'Disc',       2, true, true),
  ('body-paint',   'auto', 'Кузовные и малярные работы', 'Paintbrush', 3, true, true),
  ('car-wash',     'auto', 'Мойка и детейлинг',          'Droplets',   4, true, true),
  ('roadside',     'auto', 'Выездная техпомощь',         'LifeBuoy',   5, true, true),

  -- L1.4 Перевозки и спецтехника (4)
  ('cargo',           'transport', 'Грузоперевозки',           'Truck',   1, true,  true),
  ('heavy-equipment', 'transport', 'Спецтехника',              'Truck',   2, true,  true),
  ('towing',          'transport', 'Эвакуатор и буксировка',   'Truck',   3, false, true),
  ('delivery',        'transport', 'Курьеры и доставка',       'Package', 4, false, true),

  -- L1.5 Бьюти и здоровье (7) — все visible
  ('nails',        'beauty-health', 'Маникюр и педикюр',     'Hand',        1, true, true),
  ('lashes-brows', 'beauty-health', 'Брови и ресницы',       'Eye',         2, true, true),
  ('hair',         'beauty-health', 'Парикмахер',            'Scissors',    3, true, true),
  ('cosmetology',  'beauty-health', 'Косметология',          'Sparkles',    4, true, true),
  ('massage',      'beauty-health', 'Массаж',                'Hand',        5, true, true),
  ('stylist',      'beauty-health', 'Стилист / визажист',    'Palette',     6, true, true),
  ('home-medical', 'beauty-health', 'Медицина на дому',      'Stethoscope', 7, true, true),

  -- L1.6 Образование (6) — школа/экзамены/языки/религиозное visible
  ('school-subjects',      'education', 'Школьные предметы',         'BookOpen',      1, true,  true),
  ('exam-prep',            'education', 'Подготовка к экзаменам',    'GraduationCap', 2, true,  true),
  ('languages',            'education', 'Языки',                     'Languages',     3, true,  true),
  ('religious-education',  'education', 'Религиозное образование',   'BookOpen',      4, true,  true),
  ('extra-education',      'education', 'Дополнительное образование','Sparkles',      5, false, true),
  ('sports-coach',         'education', 'Спорт и фитнес',            'Dumbbell',      6, false, true),

  -- L1.7 События и торжества (6) — catering visible
  ('catering',      'events', 'Кейтеринг и кухня',     'Utensils', 1, true,  true),
  ('confectionery', 'events', 'Кондитеры и торты',     'Cake',     2, false, true),
  ('entertainment', 'events', 'Ведущие, музыканты',    'Mic',      3, false, true),
  ('decor',         'events', 'Декор и оформление',    'Sparkles', 4, false, true),
  ('photo-video',   'events', 'Фото и видео',          'Camera',   5, false, true),
  ('rentals',       'events', 'Прокат и аренда',       'Package',  6, false, true),

  -- L1.8 Бизнес и финансы (5)
  ('legal',       'business', 'Юридические услуги',    'Scale',      1, false, true),
  ('accounting',  'business', 'Бухгалтерия и налоги',  'Calculator', 2, false, true),
  ('translation', 'business', 'Переводы и нотариус',   'Languages',  3, false, true),
  ('hr',          'business', 'HR и рекрутинг',        'Users',      4, false, true),
  ('insurance',   'business', 'Страхование',           'Shield',     5, false, true),

  -- L1.9 IT и цифровое (4)
  ('computer-help', 'it-digital', 'Компьютерная помощь', 'Laptop',    1, false, true),
  ('dev-sites',     'it-digital', 'Разработка и сайты',  'Code',      2, false, true),
  ('marketing',     'it-digital', 'SMM и реклама',       'Megaphone', 3, false, true),
  ('design',        'it-digital', 'Дизайн',              'Palette',   4, false, true),

  -- L1.10 Личный сервис (10) — wedding-services-umbrella это тег-зонтик, is_active=false
  ('childcare',                 'personal-services', 'Уход за детьми',                 'Baby',           1, false, true),
  ('eldercare',                 'personal-services', 'Уход за пожилыми',               'Heart',          2, false, true),
  ('psychology',                'personal-services', 'Психология и коучинг',           'Brain',          3, false, true),
  ('sewing',                    'personal-services', 'Швейные услуги',                 'Scissors',       4, false, true),
  ('pet-services',              'personal-services', 'Зооуслуги',                      'PawPrint',       5, false, true),
  ('religious-services',        'personal-services', 'Религиозные / ритуальные услуги','BookOpen',       6, false, true),
  ('b2b-services',              'personal-services', 'Услуги для бизнеса',             'Building2',      7, false, true),
  ('alt-services',              'personal-services', 'Эзотерика и нетрадиционное',     'Sparkles',       8, false, true),
  ('wedding-services-umbrella', 'personal-services', 'Свадебные услуги (зонтик-тег)',  'PartyPopper',    9, false, false),
  ('other-personal',            'personal-services', 'Прочее',                         'MoreHorizontal',10, false, true)
ON CONFLICT (id) DO UPDATE SET
  l1_id = EXCLUDED.l1_id,
  name_ru = EXCLUDED.name_ru,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_visible = EXCLUDED.is_visible,
  is_active = EXCLUDED.is_active;

-- ============================================================================
-- L3 — Уровень 3 (~262 услуги)
-- ============================================================================

INSERT INTO public.categories_l3 (id, l2_id, name_ru, icon, avg_check_rub, urgency_typical, seasonality, requires_license, sort_order) VALUES
  -- general-construction (7)
  ('foundation',         'general-construction', 'Фундамент (заливка, армирование)',   'Layers',  200000, 'month', 'year_round', false, 1),
  ('walls-brick',        'general-construction', 'Кладка кирпича / блока',             'Brick',    80000, 'month', 'year_round', false, 2),
  ('roof-installation',  'general-construction', 'Кровля под ключ',                    'Home',    150000, 'month', 'year_round', false, 3),
  ('roof-repair',        'general-construction', 'Ремонт кровли (течь, замена листа)', 'Wrench',    8000, 'week',  'year_round', false, 4),
  ('overlap',            'general-construction', 'Перекрытия (монолит, балки)',        'Layers',  120000, 'month', 'year_round', false, 5),
  ('facade',             'general-construction', 'Фасадные работы',                    'Building', 90000, 'month', 'year_round', false, 6),
  ('turnkey',            'general-construction', 'Стройка дома под ключ',              'Home',   2500000, 'month', 'year_round', false, 7),

  -- finishing (8)
  ('plaster',            'finishing', 'Штукатурка стен',                  'Paintbrush', 350, 'week', 'year_round', false, 1),
  ('putty',              'finishing', 'Шпаклёвка',                        'Paintbrush', 250, 'week', 'year_round', false, 2),
  ('painting-interior',  'finishing', 'Покраска стен / потолков',         'Paintbrush', 200, 'week', 'year_round', false, 3),
  ('wallpaper',          'finishing', 'Поклейка обоев',                   'Layers',     250, 'week', 'year_round', false, 4),
  ('tiling-floor',       'finishing', 'Укладка плитки на пол',            'Grid3x3',    800, 'week', 'year_round', false, 5),
  ('tiling-wall',        'finishing', 'Облицовка стен плиткой',           'Grid3x3',    900, 'week', 'year_round', false, 6),
  ('laminate',           'finishing', 'Укладка ламината / паркета',       'Grid3x3',    400, 'week', 'year_round', false, 7),
  ('floor-screed',       'finishing', 'Стяжка пола',                      'Layers',     600, 'week', 'year_round', false, 8),

  -- electrical (9)
  ('outlet-replace',     'electrical', 'Замена розетки / выключателя',         'Plug',         800, 'urgent', 'year_round', false, 1),
  ('outlet-install',     'electrical', 'Установка новой розетки',              'Plug',        1500, 'week',   'year_round', false, 2),
  ('wiring-house',       'electrical', 'Электропроводка в доме',               'Zap',        60000, 'month',  'year_round', false, 3),
  ('wiring-apt',         'electrical', 'Электропроводка в квартире',           'Zap',        40000, 'month',  'year_round', false, 4),
  ('panel-install',      'electrical', 'Сборка / установка электрощита',       'LayoutGrid', 12000, 'week',   'year_round', false, 5),
  ('lighting-install',   'electrical', 'Установка люстры / светильника',       'Lightbulb',   1500, 'week',   'year_round', false, 6),
  ('lighting-led',       'electrical', 'Монтаж LED-подсветки',                 'Lightbulb',   5000, 'week',   'year_round', false, 7),
  ('troubleshoot',       'electrical', 'Поиск и устранение неисправности',     'AlertCircle', 2000, 'urgent', 'year_round', false, 8),
  ('grounding',          'electrical', 'Заземление',                           'Zap',         8000, 'month',  'year_round', false, 9),

  -- plumbing (9)
  ('faucet-replace',       'plumbing', 'Замена смесителя',                       'Droplet',     1500, 'urgent', 'year_round', false, 1),
  ('toilet-install',       'plumbing', 'Установка унитаза',                      'Droplet',     3000, 'week',   'year_round', false, 2),
  ('bath-install',         'plumbing', 'Установка ванны / душевой',              'Droplet',     8000, 'week',   'year_round', false, 3),
  ('wash-machine-connect', 'plumbing', 'Подключение стиральной / посудомоечной', 'Droplet',     2500, 'week',   'year_round', false, 4),
  ('boiler-install',       'plumbing', 'Установка водонагревателя',              'Flame',       6000, 'week',   'year_round', false, 5),
  ('pipes-replace',        'plumbing', 'Замена труб',                            'GitBranch',  25000, 'month',  'year_round', false, 6),
  ('sewer',                'plumbing', 'Прочистка / монтаж канализации',         'Pipette',     4000, 'urgent', 'year_round', false, 7),
  ('gas-boiler',           'plumbing', 'Газовый котёл (только с лицензией)',     'Flame',      15000, 'week',   'year_round', true,  8),
  ('heating-install',      'plumbing', 'Монтаж отопления',                       'Thermometer',80000, 'month',  'year_round', false, 9),

  -- windows-doors (8)
  ('windows-pvc',       'windows-doors', 'Пластиковые окна (замер, монтаж)',  'RectangleVertical', 18000, 'week',  'year_round', false, 1),
  ('windows-wood',      'windows-doors', 'Деревянные окна',                   'RectangleVertical', 25000, 'month', 'year_round', false, 2),
  ('door-entry',        'windows-doors', 'Установка входной двери',           'DoorOpen',           8000, 'week',  'year_round', false, 3),
  ('door-interior',     'windows-doors', 'Установка межкомнатной двери',      'DoorOpen',           3500, 'week',  'year_round', false, 4),
  ('gates-install',     'windows-doors', 'Ворота (распашные, откатные)',      'DoorOpen',          60000, 'month', 'year_round', false, 5),
  ('gates-automation',  'windows-doors', 'Автоматика на ворота',              'Cog',               25000, 'month', 'year_round', false, 6),
  ('fence',             'windows-doors', 'Заборы (профлист, сетка, кирпич)',  'Fence',              1200, 'month', 'year_round', false, 7),
  ('canopy',            'windows-doors', 'Навесы (поликарбонат, металл)',     'Umbrella',          35000, 'month', 'year_round', false, 8),

  -- ceilings (3)
  ('ceiling-tension',   'ceilings', 'Натяжной потолок',                       'Square', 450,  'week', 'year_round', false, 1),
  ('ceiling-suspended', 'ceilings', 'Подвесной потолок (Армстронг)',          'Square', 700,  'week', 'year_round', false, 2),
  ('ceiling-drywall',   'ceilings', 'Гипсокартонный потолок (многоуровневый)','Layers', 1500, 'week', 'year_round', false, 3),

  -- welding (3)
  ('weld-gates',  'welding', 'Сварка ворот / решёток',          'Flame', 8000, 'week',   'year_round', false, 1),
  ('weld-pipe',   'welding', 'Сварка труб',                     'Flame', 3000, 'week',   'year_round', false, 2),
  ('weld-onsite', 'welding', 'Выезд со сварочным аппаратом',    'Flame', 2500, 'urgent', 'year_round', false, 3),

  -- climate (3)
  ('ac-install',  'climate', 'Установка кондиционера',           'Wind', 5000, 'week',  'summer',     false, 1),
  ('ac-service',  'climate', 'Заправка / чистка кондиционера',   'Wind', 3000, 'week',  'summer',     false, 2),
  ('ventilation', 'climate', 'Монтаж вентиляции',                'Wind',25000, 'month', 'year_round', false, 3),

  -- decorative-installations (2)
  ('wall-panels',      'decorative-installations', 'Стеновые панели (3D, ПВХ)',         'Layers',     800, 'week', 'year_round', false, 1),
  ('decorative-paint', 'decorative-installations', 'Декоративная штукатурка / краска',  'Paintbrush', 700, 'week', 'year_round', false, 2),

  -- furniture (3)
  ('furniture-assembly', 'furniture', 'Сборка мебели (IKEA-стиль)',          'Wrench',   1500, 'week',  'year_round', false, 1),
  ('furniture-custom',   'furniture', 'Изготовление на заказ',               'Armchair',60000, 'month', 'year_round', false, 2),
  ('furniture-repair',   'furniture', 'Реставрация / ремонт',                'Wrench',   5000, 'week',  'year_round', false, 3),

  -- handyman (4)
  ('mount-tv',    'handyman', 'Повесить телевизор / полку',              'Wrench', 1000, 'urgent', 'year_round', false, 1),
  ('door-lock',   'handyman', 'Замена дверного замка',                   'Lock',   1500, 'urgent', 'year_round', false, 2),
  ('drill-holes', 'handyman', 'Просверлить отверстия / повесить картины','Wrench',  800, 'urgent', 'year_round', false, 3),
  ('seal-window', 'handyman', 'Заделать щели / утеплить окно',           'Wrench', 2000, 'week',   'winter',     false, 4),

  -- materials-delivery (2)
  ('materials-cement', 'materials-delivery', 'Доставка цемента / песка',  'Truck', NULL, 'week', 'year_round', false, 1),
  ('materials-bricks', 'materials-delivery', 'Доставка кирпича / блоков', 'Truck', NULL, 'week', 'year_round', false, 2),

  -- cleaning (4)
  ('cleaning-general',         'cleaning', 'Генеральная уборка',           'Sparkles', 3500, 'week', 'year_round', false, 1),
  ('cleaning-post-renovation', 'cleaning', 'Уборка после ремонта',         'Sparkles', 6000, 'week', 'year_round', false, 2),
  ('cleaning-regular',         'cleaning', 'Регулярная уборка',            'Sparkles', 2500, 'week', 'year_round', false, 3),
  ('cleaning-windows',         'cleaning', 'Мытьё окон',                   'Square',    200, 'week', 'year_round', false, 4),

  -- laundry (3)
  ('carpet-cleaning',     'laundry', 'Стирка ковров',          'LayoutGrid',  200, 'week', 'year_round', false, 1),
  ('upholstery-cleaning', 'laundry', 'Химчистка мягкой мебели','Armchair',   1500, 'week', 'year_round', false, 2),
  ('curtains-cleaning',   'laundry', 'Стирка штор',            'Wind',        800, 'week', 'year_round', false, 3),

  -- disposal (2)
  ('garbage-removal', 'disposal', 'Вывоз строймусора',                'Trash2', 4000, 'week', 'year_round', false, 1),
  ('junk-removal',    'disposal', 'Вывоз старой мебели / хлама',      'Trash2', 2500, 'week', 'year_round', false, 2),

  -- garden (4)
  ('lawn-mowing',     'garden', 'Стрижка газона',          'Scissors', 1500, 'week',  'summer', false, 1),
  ('tree-cutting',    'garden', 'Спил деревьев',           'Trees',    5000, 'week',  'year_round', false, 2),
  ('landscaping',     'garden', 'Ландшафтный дизайн',      'Trees',   50000, 'month', 'summer', false, 3),
  ('garden-planting', 'garden', 'Посадка кустов / деревьев','Sprout',    500, 'month', 'summer', false, 4),

  -- tv-internet (3)
  ('satellite-install', 'tv-internet', 'Установка спутниковой антенны', 'Satellite', 3000, 'week',   'year_round', false, 1),
  ('internet-setup',    'tv-internet', 'Настройка интернета / Wi-Fi',   'Wifi',      1500, 'urgent', 'year_round', false, 2),
  ('tv-mount',          'tv-internet', 'Настройка ТВ-приставки',        'Tv',        1500, 'week',   'year_round', false, 3),

  -- pest-control (2)
  ('pest-cockroach', 'pest-control', 'Тараканы / клопы', 'Bug', 2500, 'urgent', 'year_round', false, 1),
  ('pest-mice',      'pest-control', 'Грызуны',          'Bug', 3000, 'urgent', 'year_round', false, 2),

  -- appliances (4)
  ('fridge-repair',      'appliances', 'Ремонт холодильника',        'Refrigerator',   3000, 'urgent', 'year_round', false, 1),
  ('washmachine-repair', 'appliances', 'Ремонт стиральной машины',   'WashingMachine', 2500, 'urgent', 'year_round', false, 2),
  ('oven-repair',        'appliances', 'Ремонт духовки / плиты',     'Flame',          2500, 'week',   'year_round', false, 3),
  ('appliance-install',  'appliances', 'Подключение бытовой техники','Plug',           1500, 'week',   'year_round', false, 4),

  -- auto-service (6)
  ('oil-change',     'auto-service', 'Замена масла / фильтров',  'Droplet', 2000, 'week',   'year_round', false, 1),
  ('diagnostics',    'auto-service', 'Компьютерная диагностика', 'Cpu',     1500, 'urgent', 'year_round', false, 2),
  ('brakes',         'auto-service', 'Тормоза (колодки, диски)', 'Disc',    4500, 'urgent', 'year_round', false, 3),
  ('suspension',     'auto-service', 'Подвеска (стойки, рычаги)','Wrench',  8000, 'week',   'year_round', false, 4),
  ('engine-repair',  'auto-service', 'Ремонт двигателя',         'Cog',    35000, 'week',   'year_round', false, 5),
  ('gearbox',        'auto-service', 'Ремонт коробки передач',   'Cog',    25000, 'week',   'year_round', false, 6),

  -- tire-service (3)
  ('tire-change',   'tire-service', 'Сезонная переобувка', 'Disc', 2000, 'urgent', 'year_round', false, 1),
  ('tire-repair',   'tire-service', 'Ремонт прокола',      'Disc',  500, 'urgent', 'year_round', false, 2),
  ('tire-balance',  'tire-service', 'Балансировка',        'Disc', 1000, 'week',   'year_round', false, 3),

  -- body-paint (5)
  ('body-repair',        'body-paint', 'Кузовной ремонт после ДТП',  'Car',       25000, 'week', 'year_round', false, 1),
  ('painting-car',       'body-paint', 'Покраска автомобиля',        'Paintbrush',80000, 'month','year_round', false, 2),
  ('polish',             'body-paint', 'Полировка кузова',           'Sparkles',   4500, 'week', 'year_round', false, 3),
  ('dent-repair',        'body-paint', 'Удаление вмятин без покраски','Car',       3500, 'week', 'year_round', false, 4),
  ('windshield-replace', 'body-paint', 'Замена лобового стекла',     'Square',     8000, 'week', 'year_round', false, 5),

  -- car-wash (3)
  ('car-wash-complex',  'car-wash', 'Комплекс мойка',     'Droplets', 800, 'urgent', 'year_round', false, 1),
  ('interior-cleaning', 'car-wash', 'Химчистка салона',   'Sparkles',4500, 'week',   'year_round', false, 2),
  ('mobile-wash',       'car-wash', 'Выездная мойка',     'Truck',   1500, 'urgent', 'year_round', false, 3),

  -- roadside (2)
  ('jumpstart',           'roadside', 'Прикурить аккумулятор / запуск', 'Battery', 800,  'urgent', 'year_round', false, 1),
  ('mobile-diagnostics',  'roadside', 'Выездная диагностика',           'Cpu',     2500, 'urgent', 'year_round', false, 2),

  -- cargo (5)
  ('gazelle',         'cargo', 'Газель (1.5-3 т)',                 'Truck',  800, 'urgent', 'year_round', false, 1),
  ('cargo-large',     'cargo', 'Фура / 5+ тонн',                   'Truck', 2500, 'week',   'year_round', false, 2),
  ('movers',          'cargo', 'Грузчики',                         'Users',  500, 'urgent', 'year_round', false, 3),
  ('apartment-move',  'cargo', 'Квартирный переезд под ключ',      'PackageOpen', 8000, 'week', 'year_round', false, 4),
  ('intercity',       'cargo', 'Межгород (Магас–Назрань и далее)', 'Truck',   25, 'week',   'year_round', false, 5),

  -- heavy-equipment (5)
  ('manipulator', 'heavy-equipment', 'Манипулятор',     'Truck',  2500, 'week', 'year_round', false, 1),
  ('excavator',   'heavy-equipment', 'Экскаватор',      'Wrench', 2500, 'week', 'year_round', false, 2),
  ('crane',       'heavy-equipment', 'Автокран',        'Truck',  3500, 'week', 'year_round', false, 3),
  ('bulldozer',   'heavy-equipment', 'Бульдозер / трактор','Truck',2000,'week', 'year_round', false, 4),
  ('dumper',      'heavy-equipment', 'Самосвал',        'Truck',  1500, 'week', 'year_round', false, 5),

  -- towing (3)
  ('tow-light',   'towing', 'Эвакуатор легковой', 'Truck', 2500, 'urgent', 'year_round', false, 1),
  ('tow-truck',   'towing', 'Эвакуатор грузовой', 'Truck', 6000, 'urgent', 'year_round', false, 2),
  ('mobile-fuel', 'towing', 'Подвоз топлива',     'Fuel',  1500, 'urgent', 'year_round', false, 3),

  -- delivery (2)
  ('courier-city',  'delivery', 'Курьер по городу',          'Package',     400, 'urgent', 'year_round', false, 1),
  ('delivery-food', 'delivery', 'Доставка еды / продуктов',  'ShoppingBag', 300, 'urgent', 'year_round', false, 2),

  -- nails (5)
  ('manicure-classic', 'nails', 'Классический маникюр',     'Hand',        800, 'week', 'year_round', false, 1),
  ('manicure-gel',     'nails', 'Маникюр с гель-лаком',     'Hand',       1500, 'week', 'year_round', false, 2),
  ('pedicure',         'nails', 'Педикюр',                  'Footprints', 1800, 'week', 'year_round', false, 3),
  ('nails-extension',  'nails', 'Наращивание ногтей',       'Hand',       2500, 'week', 'year_round', false, 4),
  ('manicure-mobile',  'nails', 'Маникюр на дому',          'Hand',       1800, 'week', 'year_round', false, 5),

  -- lashes-brows (6)
  ('lashes-classic',  'lashes-brows', 'Наращивание ресниц',          'Eye', 1800, 'week', 'year_round', false, 1),
  ('lashes-volume',   'lashes-brows', 'Объёмное наращивание',        'Eye', 2800, 'week', 'year_round', false, 2),
  ('brows-shaping',   'lashes-brows', 'Коррекция бровей',            'Eye',  600, 'week', 'year_round', false, 3),
  ('brows-tint',      'lashes-brows', 'Окрашивание бровей',          'Eye',  800, 'week', 'year_round', false, 4),
  ('brows-laminate',  'lashes-brows', 'Ламинирование бровей',        'Eye', 1500, 'week', 'year_round', false, 5),
  ('lashes-laminate', 'lashes-brows', 'Ламинирование ресниц',        'Eye', 2000, 'week', 'year_round', false, 6),

  -- hair (6)
  ('haircut-women', 'hair', 'Женская стрижка',         'Scissors', 1200, 'week', 'year_round', false, 1),
  ('haircut-men',   'hair', 'Мужская стрижка',         'Scissors',  700, 'week', 'year_round', false, 2),
  ('haircut-kids',  'hair', 'Детская стрижка',         'Scissors',  500, 'week', 'year_round', false, 3),
  ('hair-color',    'hair', 'Окрашивание',             'Palette',  3500, 'week', 'year_round', false, 4),
  ('hair-styling',  'hair', 'Укладка / причёска',      'Sparkles', 3000, 'week', 'wedding_season', false, 5),
  ('hair-keratin',  'hair', 'Кератиновое выпрямление', 'Sparkles', 6000, 'week', 'year_round', false, 6),

  -- cosmetology (3)
  ('facial-cleaning', 'cosmetology', 'Чистка лица',                          'User',     2500, 'week', 'year_round', false, 1),
  ('peeling',         'cosmetology', 'Пилинг',                               'Sparkles', 3500, 'week', 'year_round', false, 2),
  ('injections',      'cosmetology', 'Уколы красоты (только с лицензией)',   'Syringe',  6000, 'week', 'year_round', true,  3),

  -- massage (3)
  ('massage-classic',  'massage', 'Классический массаж', 'Hand',        1800, 'week', 'year_round', false, 1),
  ('massage-therapy',  'massage', 'Лечебный массаж',     'Stethoscope', 2500, 'week', 'year_round', false, 2),
  ('massage-children', 'massage', 'Детский массаж',      'Baby',        1500, 'week', 'year_round', false, 3),

  -- stylist (3)
  ('makeup-day',     'stylist', 'Дневной макияж',         'Palette', 2500, 'week', 'year_round',      false, 1),
  ('makeup-wedding', 'stylist', 'Свадебный макияж',       'Palette', 6000, 'week', 'wedding_season',  false, 2),
  ('stylist-consult','stylist', 'Шопер / стилист по гардеробу','Shirt',3500,'week','year_round',     false, 3),

  -- home-medical (3)
  ('injections-home','home-medical', 'Уколы / капельницы (медсестра)', 'Syringe',     500, 'urgent', 'year_round', true,  1),
  ('rehab',          'home-medical', 'Реабилитация после травмы',      'Stethoscope',2500, 'week',   'year_round', false, 2),
  ('wound-care',     'home-medical', 'Перевязки, уход за раной',       'Bandage',     800, 'urgent', 'year_round', false, 3),

  -- school-subjects (7)
  ('math-school',        'school-subjects', 'Математика (1-11 кл.)',     'Calculator',   700, 'week', 'year_round', false, 1),
  ('russian-school',     'school-subjects', 'Русский язык',              'BookOpen',     700, 'week', 'year_round', false, 2),
  ('physics-school',     'school-subjects', 'Физика',                    'Atom',         800, 'week', 'year_round', false, 3),
  ('chemistry-school',   'school-subjects', 'Химия',                     'FlaskConical', 800, 'week', 'year_round', false, 4),
  ('biology-school',     'school-subjects', 'Биология',                  'Sprout',       700, 'week', 'year_round', false, 5),
  ('history-school',     'school-subjects', 'История / Обществознание',  'BookOpen',     700, 'week', 'year_round', false, 6),
  ('informatics-school', 'school-subjects', 'Информатика',               'Code',         800, 'week', 'year_round', false, 7),

  -- exam-prep (4)
  ('ege-prep',        'exam-prep', 'ЕГЭ',               'GraduationCap',  1200, 'month', 'year_round', false, 1),
  ('oge-prep',        'exam-prep', 'ОГЭ',               'GraduationCap',   900, 'month', 'year_round', false, 2),
  ('vpr-prep',        'exam-prep', 'ВПР',               'GraduationCap',   700, 'week',  'year_round', false, 3),
  ('university-entry','exam-prep', 'Поступление в ВУЗ', 'GraduationCap', 25000, 'month', 'year_round', false, 4),

  -- languages (6)
  ('english',          'languages', 'Английский',                 'Languages', 1000, 'week', 'year_round', false, 1),
  ('arabic',           'languages', 'Арабский',                   'Languages', 1200, 'week', 'year_round', false, 2),
  ('ingush',           'languages', 'Ингушский',                  'Languages',  600, 'week', 'year_round', false, 3),
  ('chechen',          'languages', 'Чеченский',                  'Languages',  600, 'week', 'year_round', false, 4),
  ('russian-foreign',  'languages', 'Русский как иностранный',    'Languages', 1000, 'week', 'year_round', false, 5),
  ('turkish',          'languages', 'Турецкий',                   'Languages', 1200, 'week', 'year_round', false, 6),

  -- religious-education (3)
  ('quran-reading',      'religious-education', 'Чтение Корана',                'BookOpen',  800, 'week', 'year_round', false, 1),
  ('quran-memorization', 'religious-education', 'Заучивание сур (Хифз)',        'BookOpen', 1000, 'week', 'year_round', false, 2),
  ('islamic-basics',     'religious-education', 'Основы исламского вероучения', 'BookOpen',  700, 'week', 'year_round', false, 3),

  -- extra-education (6)
  ('chess',              'extra-education', 'Шахматы',                    'Crown',          800, 'week', 'year_round', false, 1),
  ('music-instruments',  'extra-education', 'Музыкальные инструменты',    'Music',         1000, 'week', 'year_round', false, 2),
  ('vocal',              'extra-education', 'Вокал / пение',              'Mic',           1200, 'week', 'year_round', false, 3),
  ('drawing',            'extra-education', 'Рисование',                  'Palette',        800, 'week', 'year_round', false, 4),
  ('programming-kids',   'extra-education', 'Программирование для детей', 'Code',          1500, 'week', 'year_round', false, 5),
  ('speech-therapy',     'extra-education', 'Логопед',                    'MessageCircle', 1200, 'week', 'year_round', false, 6),

  -- sports-coach (4)
  ('personal-trainer', 'sports-coach', 'Персональный тренер',     'Dumbbell', 1500, 'week', 'year_round', false, 1),
  ('yoga',             'sports-coach', 'Йога',                    'User',     1000, 'week', 'year_round', false, 2),
  ('boxing-coach',     'sports-coach', 'Бокс / единоборства',     'Dumbbell', 1500, 'week', 'year_round', false, 3),
  ('swimming',         'sports-coach', 'Плавание',                'Waves',    1500, 'week', 'year_round', false, 4),

  -- catering (5)
  ('wedding-catering',  'catering', 'Свадебный стол',                'Utensils',  800, 'month',  'wedding_season', false, 1),
  ('funeral-catering',  'catering', 'Поминальный стол',              'Utensils',  500, 'urgent', 'year_round',     false, 2),
  ('banquet-cooking',   'catering', 'Повар на банкет',               'ChefHat', 12000, 'week',   'year_round',     false, 3),
  ('home-chef',         'catering', 'Повар на дом',                  'ChefHat',  3500, 'week',   'year_round',     false, 4),
  ('national-cuisine',  'catering', 'Национальная кухня',            'Utensils',  700, 'month',  'year_round',     false, 5),

  -- confectionery (3)
  ('wedding-cake',  'confectionery', 'Свадебный торт',            'Cake', 3500, 'month', 'wedding_season', false, 1),
  ('birthday-cake', 'confectionery', 'Праздничный торт',          'Cake', 1800, 'week',  'year_round',     false, 2),
  ('desserts',      'confectionery', 'Капкейки / пироги / макаруны','Cookie',200,'week', 'year_round',     false, 3),

  -- entertainment (7)
  ('host-russian',  'entertainment', 'Ведущий / тамада',           'Mic',  25000, 'month', 'wedding_season', false, 1),
  ('host-ingush',   'entertainment', 'Ведущий на ингушском',       'Mic',  20000, 'month', 'wedding_season', false, 2),
  ('singer',        'entertainment', 'Певец / певица',             'Music',15000, 'month', 'wedding_season', false, 3),
  ('accordion',     'entertainment', 'Гармонист',                  'Music',10000, 'month', 'wedding_season', false, 4),
  ('ensemble',      'entertainment', 'Ансамбль / группа',          'Music',40000, 'month', 'wedding_season', false, 5),
  ('dj',            'entertainment', 'DJ',                         'Disc3',15000, 'month', 'wedding_season', false, 6),
  ('animator',      'entertainment', 'Аниматор детский',           'Smile', 5000, 'week',  'year_round',     false, 7),

  -- decor (4)
  ('arch-flowers',  'decor', 'Свадебная арка / цветы',  'Flower2', 25000, 'month', 'wedding_season', false, 1),
  ('balloons',      'decor', 'Шары / фотозоны',         'Sparkles', 8000, 'week',  'year_round',     false, 2),
  ('tables-decor',  'decor', 'Сервировка / президиум',  'Utensils',15000, 'month', 'wedding_season', false, 3),
  ('hall-decor',    'decor', 'Оформление зала',         'Sparkles',35000, 'month', 'wedding_season', false, 4),

  -- photo-video (5)
  ('photo-wedding', 'photo-video', 'Свадебный фотограф',      'Camera', 25000, 'month', 'wedding_season', false, 1),
  ('video-wedding', 'photo-video', 'Свадебный видеограф',     'Video',  35000, 'month', 'wedding_season', false, 2),
  ('photo-event',   'photo-video', 'Репортажная фотосъёмка',  'Camera',  8000, 'week',  'year_round',     false, 3),
  ('studio-photo',  'photo-video', 'Студийная фотосессия',    'Camera',  4500, 'week',  'year_round',     false, 4),
  ('drone',         'photo-video', 'Аэросъёмка дрон',         'Plane',   8000, 'week',  'year_round',     false, 5),

  -- rentals (3)
  ('dress-rental',  'rentals', 'Прокат свадебного / вечернего платья', 'Shirt', 5000, 'week',  'wedding_season', false, 1),
  ('car-wedding',   'rentals', 'Свадебный кортеж / лимузин',           'Car',   8000, 'month', 'wedding_season', false, 2),
  ('tent-rental',   'rentals', 'Аренда шатра / мебели',                'Tent', 25000, 'month', 'wedding_season', false, 3),

  -- legal (4)
  ('legal-consult',     'legal', 'Консультация юриста',                 'Scale',     1500, 'week',  'year_round', false, 1),
  ('contracts',         'legal', 'Составление договоров',               'FileText',  3500, 'week',  'year_round', false, 2),
  ('court-rep',         'legal', 'Представительство в суде',            'Scale',    15000, 'month', 'year_round', false, 3),
  ('real-estate-legal', 'legal', 'Сопровождение сделок с недвижимостью','Home',     12000, 'month', 'year_round', false, 4),

  -- accounting (4)
  ('self-employed-setup', 'accounting', 'Открытие самозанятости',  'UserCheck', 1500, 'urgent', 'year_round', false, 1),
  ('ip-registration',     'accounting', 'Регистрация ИП',          'FileText',  3500, 'week',   'year_round', false, 2),
  ('bookkeeping',         'accounting', 'Бухгалтерское обслуживание','Calculator',5000,'week',  'year_round', false, 3),
  ('tax-declaration',     'accounting', 'Декларация 3-НДФЛ',       'FileText',  2500, 'week',   'year_round', false, 4),

  -- translation (2)
  ('translation-docs', 'translation', 'Перевод документов',                'FileText',  500, 'week', 'year_round', false, 1),
  ('notary-prep',      'translation', 'Помощь с нотариальными делами',     'FileText', 1500, 'week', 'year_round', false, 2),

  -- hr (2)
  ('hiring',     'hr', 'Подбор персонала',         'Users', 8000, 'month', 'year_round', false, 1),
  ('hr-consult', 'hr', 'Консультация по кадрам',   'Users', 2500, 'week',  'year_round', false, 2),

  -- insurance (4)
  ('osago',              'insurance', 'Оформление ОСАГО',     'Car',          500, 'urgent', 'year_round', false, 1),
  ('kasko',              'insurance', 'КАСКО',                'Car',         1500, 'week',   'year_round', false, 2),
  ('property-insurance', 'insurance', 'Страхование жилья',    'Home',        1500, 'week',   'year_round', false, 3),
  ('health-insurance',   'insurance', 'ДМС',                  'Stethoscope', 1500, 'week',   'year_round', false, 4),

  -- computer-help (5)
  ('windows-setup',  'computer-help', 'Установка Windows / macOS', 'Monitor',  1500, 'urgent', 'year_round', false, 1),
  ('virus-removal',  'computer-help', 'Удаление вирусов',           'Bug',     1500, 'urgent', 'year_round', false, 2),
  ('data-recovery',  'computer-help', 'Восстановление данных',      'Database',5000, 'urgent', 'year_round', false, 3),
  ('printer-setup',  'computer-help', 'Настройка принтера / сети',  'Printer', 1500, 'week',   'year_round', false, 4),
  ('pc-repair',      'computer-help', 'Ремонт компьютера / ноутбука','Laptop', 2500, 'week',   'year_round', false, 5),

  -- dev-sites (5)
  ('landing-page', 'dev-sites', 'Landing / сайт-визитка',           'Layout',      25000, 'month', 'year_round', false, 1),
  ('online-store', 'dev-sites', 'Интернет-магазин',                 'ShoppingCart',80000, 'month', 'year_round', false, 2),
  ('mobile-app',   'dev-sites', 'Мобильное приложение',             'Smartphone', 200000, 'month', 'year_round', false, 3),
  ('seo',          'dev-sites', 'SEO продвижение',                  'TrendingUp',  15000, 'month', 'year_round', false, 4),
  ('crm-setup',    'dev-sites', 'Настройка CRM / автоматизации',    'Cog',         25000, 'month', 'year_round', false, 5),

  -- marketing (3)
  ('smm',       'marketing', 'Ведение соцсетей',           'Instagram', 15000, 'month', 'year_round', false, 1),
  ('targeting', 'marketing', 'Таргетированная реклама',    'Target',    12000, 'week',  'year_round', false, 2),
  ('branding',  'marketing', 'Брендинг / логотип',         'Palette',   15000, 'month', 'year_round', false, 3),

  -- design (3)
  ('interior-design', 'design', 'Дизайн интерьера',              'Home',    60000, 'month', 'year_round', false, 1),
  ('graphic-design',  'design', 'Графический дизайн / полиграфия','Palette', 3500, 'week',  'year_round', false, 2),
  ('3d-vis',          'design', '3D-визуализация',               'Box',     25000, 'month', 'year_round', false, 3),

  -- childcare (4)
  ('nanny-hourly',   'childcare', 'Няня почасовая',     'Baby',  350, 'week',   'year_round', false, 1),
  ('nanny-fulltime', 'childcare', 'Няня постоянная',    'Baby',35000, 'month',  'year_round', false, 2),
  ('governess',      'childcare', 'Гувернантка',        'User',50000, 'month',  'year_round', false, 3),
  ('nanny-evening',  'childcare', 'Няня на вечер',      'Baby',  500, 'urgent', 'year_round', false, 4),

  -- eldercare (3)
  ('caregiver-hourly',   'eldercare', 'Сиделка почасовая',      'Heart',   250, 'week',   'year_round', false, 1),
  ('caregiver-fulltime', 'eldercare', 'Сиделка с проживанием',  'Heart', 40000, 'month',  'year_round', false, 2),
  ('caregiver-hospital', 'eldercare', 'Сиделка в больнице',     'Heart',  1500, 'urgent', 'year_round', false, 3),

  -- psychology (4)
  ('psychologist',       'psychology', 'Психолог',          'Brain',  2500, 'week', 'year_round', false, 1),
  ('family-counseling',  'psychology', 'Семейный психолог', 'Heart',  3500, 'week', 'year_round', false, 2),
  ('child-psychologist', 'psychology', 'Детский психолог',  'Baby',   2500, 'week', 'year_round', false, 3),
  ('coach',              'psychology', 'Коуч',              'Target', 3500, 'week', 'year_round', false, 4),

  -- sewing (4)
  ('clothes-repair',    'sewing', 'Ремонт одежды',         'Shirt',     500, 'week',  'year_round', false, 1),
  ('clothes-tailoring', 'sewing', 'Подгонка по фигуре',    'Shirt',     800, 'week',  'year_round', false, 2),
  ('custom-sewing',     'sewing', 'Пошив на заказ',        'Scissors', 3500, 'month', 'year_round', false, 3),
  ('national-clothes',  'sewing', 'Национальная одежда',   'Shirt',    8000, 'month', 'wedding_season', false, 4),

  -- pet-services (4)
  ('pet-grooming', 'pet-services', 'Груминг',         'PawPrint',    2500, 'week',   'year_round', false, 1),
  ('pet-walking',  'pet-services', 'Выгул собак',     'PawPrint',     300, 'urgent', 'year_round', false, 2),
  ('pet-sitting',  'pet-services', 'Передержка',      'PawPrint',     500, 'week',   'year_round', false, 3),
  ('vet-home',     'pet-services', 'Ветеринар на дом','Stethoscope', 1500, 'urgent', 'year_round', true,  4),

  -- religious-services (4)
  ('mawlid-host',      'religious-services', 'Проведение мовлида',           'BookOpen', 5000, 'week',   'year_round', false, 1),
  ('imam-service',     'religious-services', 'Имам на дом',                  'BookOpen', 3500, 'urgent', 'year_round', false, 2),
  ('tahara',           'religious-services', 'Подготовка к погребению',      'BookOpen', NULL, 'urgent', 'year_round', false, 3),
  ('quran-recitation', 'religious-services', 'Чтение Корана на меджлисе',    'BookOpen', 3500, 'week',   'year_round', false, 4),

  -- b2b-services (2)
  ('office-cleaning', 'b2b-services', 'Клининг офисов',            'Sparkles', 8000, 'month', 'year_round', false, 1),
  ('office-it',       'b2b-services', 'IT-обслуживание организаций','Server', 15000, 'month', 'year_round', false, 2),

  -- alt-services (1)
  ('astrology', 'alt-services', 'Астрология / нумерология', 'Sparkles', 2500, 'week', 'year_round', false, 1),

  -- other-personal (1)
  ('other', 'other-personal', 'Прочее (с обязательным описанием)', 'MoreHorizontal', NULL, 'week', 'year_round', false, 1)
ON CONFLICT (id) DO UPDATE SET
  l2_id = EXCLUDED.l2_id,
  name_ru = EXCLUDED.name_ru,
  icon = EXCLUDED.icon,
  avg_check_rub = EXCLUDED.avg_check_rub,
  urgency_typical = EXCLUDED.urgency_typical,
  seasonality = EXCLUDED.seasonality,
  requires_license = EXCLUDED.requires_license,
  sort_order = EXCLUDED.sort_order;

COMMIT;
