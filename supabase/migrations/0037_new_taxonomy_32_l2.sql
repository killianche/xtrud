-- 0037_new_taxonomy_32_l2.sql
-- Sprint J — новая таксономия по запросу пользователя: 32 L2 категории
-- + ~230 L3 подкатегорий, фокус на ремонт/строительство/быт-ремонт.
--
-- Стратегия:
--   1. Сначала ВСЕ existing L2 → is_visible=false, is_featured=false
--      (сохраняем FK для master_categories, но прячем в UI).
--   2. Полностью переписываем L3 (DELETE + INSERT).
--   3. INSERT...ON CONFLICT(id) DO UPDATE для 32 новых/переиспользуемых L2.
--      Где id совпадает со старым — обновляем name_ru, sort_order, иконку.
--      Старые master_categories привязки сохраняются.
--
-- Переиспользуемые id (из старой таксономии — мастера остаются привязанными):
--   plumbing, electrical, handyman, climate, furniture, welding, ceilings,
--   general-construction
-- Новые id (29 штук):
--   water-sewer, renovation, cleaning-post-renovation, windows, doors,
--   locks-security, painting, plaster-putty, drywall, tiling, floors,
--   tension-ceilings, insulation, roofing, facade, concrete, masonry,
--   drilling-wells, fences-gates, landscape, baths-pools, curtains-blinds,
--   interior-design, demolition
--
-- Старый cleaning (Клининг) → is_visible=false; вместо него
-- cleaning-post-renovation (Уборка после ремонта) — это узкоспециализированная
-- категория ремонтной аудитории, общий клининг скрываем.

-- ============================================================================
-- 1. Гасим всё старое.
-- ============================================================================

UPDATE public.categories_l2 SET is_visible = false, is_featured = false;
DELETE FROM public.categories_l3;

-- ============================================================================
-- 2. INSERT/UPDATE 32 L2.
--    Все привязаны к L1 = 'construction' (Строительство и ремонт).
-- ============================================================================

INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_visible, is_featured) VALUES
  ('plumbing',                  'construction', 'Сантехника',                'Droplet',     10, true, true),
  ('water-sewer',               'construction', 'Водоснабжение и канализация','Droplets',   20, true, false),
  ('electrical',                'construction', 'Электрика',                 'Zap',         30, true, false),
  ('renovation',                'construction', 'Ремонт и отделка',          'Hammer',      40, true, true),
  ('handyman',                  'construction', 'Мастер на час',             'Wrench',      50, true, false),
  ('cleaning-post-renovation',  'construction', 'Уборка после ремонта',      'Sparkles',    60, true, false),
  ('windows',                   'construction', 'Окна и остекление',         'RectangleHorizontal', 70, true, false),
  ('doors',                     'construction', 'Двери',                     'DoorOpen',    80, true, false),
  ('locks-security',            'construction', 'Замки и безопасность',      'Lock',        90, true, false),
  ('painting',                  'construction', 'Покраска и шпаклёвка',      'Paintbrush', 100, true, false),
  ('plaster-putty',             'construction', 'Штукатурка и шпаклёвка',    'Brush',      110, true, false),
  ('drywall',                   'construction', 'Гипсокартон',               'Layers',     120, true, false),
  ('tiling',                    'construction', 'Плитка и мозаика',          'Grid3x3',    130, true, false),
  ('floors',                    'construction', 'Полы и стяжка',             'LayoutGrid', 140, true, false),
  ('ceilings',                  'construction', 'Потолки',                   'Square',     150, true, false),
  ('tension-ceilings',          'construction', 'Натяжные потолки',          'CloudFog',   160, true, false),
  ('climate',                   'construction', 'Климат и отопление',        'Thermometer',170, true, false),
  ('insulation',                'construction', 'Утепление и изоляция',      'Snowflake',  180, true, false),
  ('roofing',                   'construction', 'Кровля',                    'Home',       190, true, false),
  ('facade',                    'construction', 'Фасадные работы',           'Building2',  200, true, false),
  ('concrete',                  'construction', 'Бетонные работы',           'Construction',210,true, false),
  ('masonry',                   'construction', 'Каменщики и кладка',        'Rows3',      220, true, false),
  ('welding',                   'construction', 'Сварочные работы',          'Flame',      230, true, false),
  ('general-construction',      'construction', 'Строительство',             'HardHat',    240, true, false),
  ('drilling-wells',            'construction', 'Бурение скважин и колодцы', 'Drill',      250, true, false),
  ('fences-gates',              'construction', 'Заборы и ворота',           'Fence',      260, true, false),
  ('landscape',                 'construction', 'Благоустройство и ландшафт','Trees',      270, true, false),
  ('baths-pools',               'construction', 'Бани, бассейны и хамамы',   'Waves',      280, true, false),
  ('furniture',                 'construction', 'Мебель и сборка',           'Armchair',   290, true, false),
  ('curtains-blinds',           'construction', 'Шторы и жалюзи',            'Blinds',     300, true, false),
  ('interior-design',           'construction', 'Дизайн интерьера',          'PencilRuler',310, true, false),
  ('demolition',                'construction', 'Демонтаж',                  'Pickaxe',    320, true, false)
ON CONFLICT (id) DO UPDATE SET
  l1_id      = EXCLUDED.l1_id,
  name_ru    = EXCLUDED.name_ru,
  icon       = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_visible = EXCLUDED.is_visible,
  is_featured = EXCLUDED.is_featured,
  is_active  = true;

-- ============================================================================
-- 3. INSERT 32×~7 = ~230 L3 подкатегорий.
-- ============================================================================

INSERT INTO public.categories_l3 (id, l2_id, name_ru, sort_order) VALUES
  -- 1. Сантехника
  ('faucet-replace',     'plumbing', 'Замена смесителя',              10),
  ('toilet-install',     'plumbing', 'Установка унитаза',             20),
  ('bath-install',       'plumbing', 'Установка ванны',               30),
  ('shower-install',     'plumbing', 'Установка душевой кабины',      40),
  ('sink-install',       'plumbing', 'Установка раковины / мойки',    50),
  ('boiler-install',     'plumbing', 'Установка водонагревателя',     60),
  ('washer-connect',     'plumbing', 'Подключение стиральной машины', 70),
  ('dishwasher-connect', 'plumbing', 'Подключение посудомойки',       80),
  ('water-filter',       'plumbing', 'Установка фильтра воды',        90),
  ('clog-clear',         'plumbing', 'Прочистка засоров',            100),

  -- 2. Водоснабжение и канализация
  ('pipes-water',        'water-sewer', 'Замена труб водопровода',           10),
  ('water-routing-apt',  'water-sewer', 'Разводка воды в квартире',          20),
  ('sewer-internal',     'water-sewer', 'Монтаж канализационных труб',       30),
  ('sewer-external',     'water-sewer', 'Прокладка наружной канализации',    40),
  ('septic-install',     'water-sewer', 'Установка септика',                 50),
  ('pump-station',       'water-sewer', 'Насосная станция (монтаж/сервис)',  60),
  ('pipe-insulation',    'water-sewer', 'Утепление труб',                    70),
  ('emergency-plumber',  'water-sewer', 'Аварийный сантехник (прорыв)',      80),

  -- 3. Электрика
  ('outlet-replace',     'electrical', 'Замена розетки / выключателя',    10),
  ('outlet-install',     'electrical', 'Установка новой розетки',         20),
  ('wiring-apt',         'electrical', 'Электропроводка в квартире',      30),
  ('wiring-house',       'electrical', 'Электропроводка в доме',          40),
  ('panel-install',      'electrical', 'Сборка / установка электрощита',  50),
  ('lighting-install',   'electrical', 'Установка люстры / светильника',  60),
  ('led-strip',          'electrical', 'Монтаж LED-подсветки',            70),
  ('troubleshoot',       'electrical', 'Поиск и устранение неисправности',80),
  ('grounding',          'electrical', 'Заземление',                      90),
  ('rcd-install',        'electrical', 'Установка УЗО / автоматов',      100),

  -- 4. Ремонт и отделка
  ('cosmetic-apt',       'renovation', 'Косметический ремонт квартиры',     10),
  ('capital-apt',        'renovation', 'Капитальный ремонт квартиры',       20),
  ('turnkey-apt',        'renovation', 'Ремонт под ключ',                   30),
  ('bathroom-reno',      'renovation', 'Ремонт ванной комнаты',             40),
  ('kitchen-reno',       'renovation', 'Ремонт кухни',                      50),
  ('balcony-reno',       'renovation', 'Ремонт балкона / лоджии',           60),
  ('office-reno',        'renovation', 'Ремонт офиса / коммерческого',      70),
  ('house-reno',         'renovation', 'Ремонт частного дома',              80),

  -- 5. Мастер на час
  ('mount-tv',           'handyman', 'Повесить телевизор / полку',     10),
  ('mount-picture',      'handyman', 'Повесить картину / зеркало',     20),
  ('assemble-small',     'handyman', 'Сборка мелкой мебели',           30),
  ('curtain-install',    'handyman', 'Установка карниза / штор',       40),
  ('small-plumbing',     'handyman', 'Мелкая сантехника',              50),
  ('small-electrical',   'handyman', 'Мелкая электрика',               60),
  ('seal-crack',         'handyman', 'Заделать щель / трещину',        70),
  ('misc-small',         'handyman', 'Прочий мелкий ремонт',           80),

  -- 6. Уборка после ремонта
  ('clean-after-capital','cleaning-post-renovation', 'Уборка после капитального ремонта', 10),
  ('clean-after-cosm',   'cleaning-post-renovation', 'Уборка после косметического',       20),
  ('clean-residue',      'cleaning-post-renovation', 'Удаление цемента и краски',         30),
  ('clean-windows-post', 'cleaning-post-renovation', 'Мытьё окон после ремонта',          40),
  ('clean-dust',         'cleaning-post-renovation', 'Удаление строительной пыли',        50),
  ('clean-pre-move',     'cleaning-post-renovation', 'Подготовка к заселению',            60),

  -- 7. Окна и остекление
  ('windows-pvc',        'windows', 'Пластиковые окна (замер, монтаж)', 10),
  ('windows-wood',       'windows', 'Деревянные окна',                  20),
  ('windows-aluminum',   'windows', 'Алюминиевые окна',                 30),
  ('balcony-glazing',    'windows', 'Остекление балкона / лоджии',      40),
  ('window-slope',       'windows', 'Установка оконных откосов',        50),
  ('glass-replace',      'windows', 'Замена стеклопакета',              60),
  ('window-repair',      'windows', 'Регулировка / ремонт окон',        70),
  ('mosquito-net',       'windows', 'Москитные сетки',                  80),

  -- 8. Двери
  ('door-entry',         'doors', 'Установка входной двери',     10),
  ('door-interior',      'doors', 'Установка межкомнатной двери',20),
  ('door-restore',       'doors', 'Реставрация / ремонт двери',  30),
  ('door-sliding',       'doors', 'Раздвижные двери',            40),
  ('door-closer',        'doors', 'Установка доводчика',         50),
  ('door-frame',         'doors', 'Замена дверной коробки',      60),
  ('door-leaf',          'doors', 'Замена дверного полотна',     70),

  -- 9. Замки и безопасность
  ('lock-replace',       'locks-security', 'Замена дверного замка',          10),
  ('lock-emergency',     'locks-security', 'Аварийное вскрытие замка',       20),
  ('lock-rekey',         'locks-security', 'Перекодировка замка',            30),
  ('intercom',           'locks-security', 'Домофон / видеоглазок',          40),
  ('alarm-install',      'locks-security', 'Монтаж сигнализации',            50),
  ('cctv-install',       'locks-security', 'Камеры видеонаблюдения',         60),

  -- 10. Покраска и шпаклёвка
  ('paint-walls',        'painting', 'Покраска стен',                10),
  ('paint-ceiling',      'painting', 'Покраска потолка',             20),
  ('paint-facade',       'painting', 'Покраска фасада',              30),
  ('paint-radiator',     'painting', 'Покраска радиаторов / труб',   40),
  ('paint-finish-putty', 'painting', 'Финишная шпаклёвка под покраску',50),
  ('paint-sanding',      'painting', 'Шлифовка стен',                60),
  ('paint-decorative',   'painting', 'Декоративная покраска',        70),

  -- 11. Штукатурка и шпаклёвка
  ('plaster-machine',    'plaster-putty', 'Машинная штукатурка',           10),
  ('plaster-manual',     'plaster-putty', 'Ручная штукатурка',             20),
  ('plaster-beacons',    'plaster-putty', 'Штукатурка по маякам',          30),
  ('putty-walls',        'plaster-putty', 'Шпаклёвка стен',                40),
  ('putty-ceiling',      'plaster-putty', 'Шпаклёвка потолка',             50),
  ('walls-level',        'plaster-putty', 'Выравнивание стен',             60),
  ('plaster-venetian',   'plaster-putty', 'Венецианская / декоративная',   70),

  -- 12. Гипсокартон
  ('drywall-partition',  'drywall', 'Перегородки из гипсокартона',     10),
  ('drywall-ceiling-1',  'drywall', 'Потолок одноуровневый',           20),
  ('drywall-ceiling-n',  'drywall', 'Потолок многоуровневый',          30),
  ('drywall-box',        'drywall', 'Короба из гипсокартона',          40),
  ('drywall-arch',       'drywall', 'Арки и ниши',                     50),
  ('drywall-walls',      'drywall', 'Обшивка стен гипсокартоном',      60),
  ('drywall-decor',      'drywall', 'Декоративные элементы',           70),

  -- 13. Плитка и мозаика
  ('tile-bathroom',      'tiling', 'Облицовка ванной / санузла', 10),
  ('tile-floor',         'tiling', 'Укладка плитки на пол',      20),
  ('tile-kitchen-apron', 'tiling', 'Кухонный фартук',            30),
  ('tile-mosaic',        'tiling', 'Мозаика',                    40),
  ('tile-porcelain',     'tiling', 'Керамогранит на пол',        50),
  ('tile-grout',         'tiling', 'Затирка / реставрация швов', 60),
  ('tile-demo',          'tiling', 'Демонтаж старой плитки',     70),

  -- 14. Полы и стяжка
  ('screed-cement',      'floors', 'Стяжка цементная',             10),
  ('screed-self-level',  'floors', 'Самовыравнивающаяся стяжка',   20),
  ('screed-dry',         'floors', 'Сухая стяжка (Кнауф)',         30),
  ('laminate',           'floors', 'Укладка ламината',             40),
  ('parquet',            'floors', 'Укладка паркетной доски',      50),
  ('linoleum',           'floors', 'Укладка линолеума',            60),
  ('quartz-vinyl',       'floors', 'Кварц-винил / SPC',            70),
  ('warm-floor-elec',    'floors', 'Тёплый пол электрический',     80),
  ('warm-floor-water',   'floors', 'Тёплый пол водяной',           90),
  ('floor-sanding',      'floors', 'Циклёвка / шлифовка пола',    100),

  -- 15. Потолки
  ('ceiling-armstrong',  'ceilings', 'Подвесной (Армстронг)',       10),
  ('ceiling-rack',       'ceilings', 'Реечный потолок',             20),
  ('ceiling-cassette',   'ceilings', 'Кассетный потолок',           30),
  ('ceiling-wood',       'ceilings', 'Деревянный потолок',          40),
  ('ceiling-paint',      'ceilings', 'Покраска / побелка потолка',  50),
  ('ceiling-drywall',    'ceilings', 'Гипсокартонный потолок',      60),

  -- 16. Натяжные потолки
  ('tension-1lvl',       'tension-ceilings', 'Одноуровневый',                  10),
  ('tension-nlvl',       'tension-ceilings', 'Многоуровневый',                 20),
  ('tension-light',      'tension-ceilings', 'С подсветкой',                   30),
  ('tension-fabric',     'tension-ceilings', 'Тканевый',                       40),
  ('tension-print',      'tension-ceilings', 'Фотопечать',                     50),
  ('tension-stars',      'tension-ceilings', 'Звёздное небо',                  60),
  ('tension-repair',     'tension-ceilings', 'Ремонт натяжного потолка',       70),

  -- 17. Климат и отопление
  ('ac-install',         'climate', 'Установка кондиционера',          10),
  ('ac-service',         'climate', 'Чистка / заправка кондиционера',  20),
  ('ac-uninstall',       'climate', 'Демонтаж кондиционера',           30),
  ('ventilation',        'climate', 'Приточно-вытяжная вентиляция',    40),
  ('radiator-install',   'climate', 'Монтаж радиаторов',               50),
  ('warm-baseboard',     'climate', 'Тёплый плинтус',                  60),
  ('gas-boiler',         'climate', 'Газовый котёл (с лицензией)',     70),
  ('electric-boiler',    'climate', 'Электрокотёл',                    80),
  ('heating-flush',      'climate', 'Промывка системы отопления',      90),

  -- 18. Утепление и изоляция
  ('insul-walls-in',     'insulation', 'Утепление стен (внутри)',     10),
  ('insul-facade',       'insulation', 'Утепление фасада',            20),
  ('insul-roof',         'insulation', 'Утепление кровли',            30),
  ('insul-floor',        'insulation', 'Утепление пола',              40),
  ('insul-balcony',      'insulation', 'Утепление балкона / лоджии',  50),
  ('sound-walls',        'insulation', 'Шумоизоляция стен',           60),
  ('sound-ceiling',      'insulation', 'Шумоизоляция потолка',        70),
  ('vapor-barrier',      'insulation', 'Пароизоляция / гидроизоляция',80),

  -- 19. Кровля
  ('roof-metal',         'roofing', 'Металлочерепица',             10),
  ('roof-soft',           'roofing', 'Мягкая кровля (битум)',      20),
  ('roof-profnastil',    'roofing', 'Профнастил',                  30),
  ('roof-tile-natural',  'roofing', 'Натуральная черепица',        40),
  ('roof-repair',        'roofing', 'Ремонт кровли',               50),
  ('drainage',           'roofing', 'Водосточная система',         60),
  ('roof-insulation',    'roofing', 'Утепление кровли',            70),
  ('snow-stops',         'roofing', 'Снегозадержатели / переходы', 80),

  -- 20. Фасадные работы
  ('facade-plaster',     'facade', 'Штукатурка фасада',          10),
  ('facade-paint',       'facade', 'Покраска фасада',            20),
  ('siding',             'facade', 'Сайдинг',                    30),
  ('facade-stone',       'facade', 'Облицовка камнем',           40),
  ('facade-brick',       'facade', 'Облицовка кирпичом',         50),
  ('ventilated-facade',  'facade', 'Вентилируемый фасад',        60),
  ('facade-insulation',  'facade', 'Утепление фасада',           70),

  -- 21. Бетонные работы
  ('foundation',         'concrete', 'Заливка фундамента',           10),
  ('monolith-overlap',   'concrete', 'Монолитные перекрытия',        20),
  ('concrete-stairs',    'concrete', 'Бетонные лестницы',            30),
  ('concrete-screed',    'concrete', 'Стяжка / черновой пол',        40),
  ('rebar',              'concrete', 'Армирование',                  50),
  ('formwork',           'concrete', 'Опалубка',                     60),
  ('concrete-decor',     'concrete', 'Декоративный бетон',           70),
  ('diamond-cut',        'concrete', 'Резка / алмазное бурение',     80),

  -- 22. Каменщики и кладка
  ('masonry-brick',      'masonry', 'Кладка кирпича',                10),
  ('masonry-aerated',    'masonry', 'Газобетонные блоки',            20),
  ('masonry-foam',       'masonry', 'Пенобетонные блоки',            30),
  ('masonry-shell',      'masonry', 'Ракушечник',                    40),
  ('masonry-clinker',    'masonry', 'Облицовочный кирпич',           50),
  ('masonry-fireplace',  'masonry', 'Печи / камины',                 60),
  ('masonry-partition',  'masonry', 'Перегородки',                   70),

  -- 23. Сварочные работы
  ('weld-gates',         'welding', 'Сварка ворот / калиток',          10),
  ('weld-bars',          'welding', 'Сварка решёток на окна',          20),
  ('weld-structures',    'welding', 'Сварка металлоконструкций',       30),
  ('weld-pipe',          'welding', 'Сварка труб',                     40),
  ('weld-fence',         'welding', 'Сварка ограждений / лестниц',     50),
  ('weld-onsite',        'welding', 'Выезд со сварочным аппаратом',    60),
  ('weld-semi-auto',     'welding', 'Полуавтоматическая сварка',       70),
  ('weld-argon',         'welding', 'Аргонная сварка',                 80),

  -- 24. Строительство (general-construction, переиспользуем id)
  ('build-turnkey',      'general-construction', 'Дом под ключ',             10),
  ('build-shell',        'general-construction', 'Возведение коробки',       20),
  ('build-frame',        'general-construction', 'Каркасное строительство',  30),
  ('build-garage',       'general-construction', 'Гараж / навес',            40),
  ('build-extension',    'general-construction', 'Пристройка',               50),
  ('build-dacha',        'general-construction', 'Дачные / садовые домики',  60),
  ('build-shed',         'general-construction', 'Хозблок / сарай',          70),

  -- 25. Бурение скважин и колодцы
  ('well-drill',         'drilling-wells', 'Бурение скважины на воду',    10),
  ('well-repair',        'drilling-wells', 'Капитальный ремонт скважины', 20),
  ('caisson-install',    'drilling-wells', 'Монтаж кессона',              30),
  ('well-house-connect', 'drilling-wells', 'Подключение скважины к дому', 40),
  ('well-dig',           'drilling-wells', 'Копка колодца',               50),
  ('well-deepen',        'drilling-wells', 'Чистка / углубление колодца', 60),
  ('pump-select',        'drilling-wells', 'Подбор и установка насоса',   70),
  ('water-analysis',     'drilling-wells', 'Анализ воды',                 80),

  -- 26. Заборы и ворота
  ('fence-profnastil',   'fences-gates', 'Забор из профнастила',       10),
  ('fence-mesh',         'fences-gates', 'Забор из сетки-рабицы',      20),
  ('fence-euro',         'fences-gates', 'Евроштакетник',              30),
  ('fence-brick',        'fences-gates', 'Кирпичный забор',            40),
  ('fence-forged',       'fences-gates', 'Кованый забор',              50),
  ('gates-swing',        'fences-gates', 'Распашные ворота',           60),
  ('gates-sliding',      'fences-gates', 'Откатные ворота',            70),
  ('gates-auto',         'fences-gates', 'Автоматика для ворот',       80),
  ('wickets',            'fences-gates', 'Калитки',                    90),

  -- 27. Благоустройство и ландшафт
  ('paving',             'landscape', 'Тротуарная плитка',           10),
  ('lawn',               'landscape', 'Газон (рулонный / посевной)', 20),
  ('tree-pruning',       'landscape', 'Спил / обрезка деревьев',     30),
  ('rockery',            'landscape', 'Альпийские горки / клумбы',   40),
  ('drainage-system',    'landscape', 'Дренажная система',           50),
  ('auto-watering',      'landscape', 'Автополив',                   60),
  ('garden-lighting',    'landscape', 'Освещение участка',           70),
  ('gazebo',             'landscape', 'Беседки / навесы / перголы',  80),
  ('playground',         'landscape', 'Детская / спортивная площадка',90),

  -- 28. Бани, бассейны и хамамы
  ('bath-turnkey',       'baths-pools', 'Баня под ключ',                10),
  ('bath-interior',      'baths-pools', 'Внутренняя отделка бани',      20),
  ('bath-stove',         'baths-pools', 'Установка банной печи',        30),
  ('hammam',             'baths-pools', 'Турецкая баня (хамам)',        40),
  ('pool-build',         'baths-pools', 'Строительство бассейна',       50),
  ('pool-interior',      'baths-pools', 'Отделка бассейна',             60),
  ('pool-service',       'baths-pools', 'Обслуживание / чистка',        70),
  ('pool-waterproof',    'baths-pools', 'Гидроизоляция бассейна',       80),

  -- 29. Мебель и сборка
  ('furniture-assembly', 'furniture', 'Сборка корпусной мебели',     10),
  ('furniture-custom',   'furniture', 'Изготовление на заказ',       20),
  ('furniture-kitchen',  'furniture', 'Кухонные гарнитуры',          30),
  ('furniture-wardrobe', 'furniture', 'Шкафы-купе',                  40),
  ('furniture-massive',  'furniture', 'Мебель из массива',           50),
  ('furniture-repair',   'furniture', 'Реставрация / ремонт',        60),
  ('furniture-reupholst','furniture', 'Перетяжка мягкой мебели',     70),

  -- 30. Шторы и жалюзи
  ('cornice-install',    'curtains-blinds', 'Установка карнизов',         10),
  ('curtain-sewing',     'curtains-blinds', 'Пошив штор на заказ',        20),
  ('roman-blinds',       'curtains-blinds', 'Римские / рулонные шторы',   30),
  ('blinds-horizontal',  'curtains-blinds', 'Горизонтальные жалюзи',      40),
  ('blinds-vertical',    'curtains-blinds', 'Вертикальные жалюзи',        50),
  ('blinds-day-night',   'curtains-blinds', 'Плиссе / день-ночь',         60),
  ('window-tint',        'curtains-blinds', 'Тонировка / витражная плёнка',70),

  -- 31. Дизайн интерьера
  ('design-apt',         'interior-design', 'Дизайн-проект квартиры',     10),
  ('design-house',       'interior-design', 'Дизайн-проект дома',         20),
  ('design-commercial',  'interior-design', 'Коммерческое помещение',     30),
  ('design-3d',          'interior-design', '3D-визуализация',            40),
  ('design-materials',   'interior-design', 'Подбор материалов',          50),
  ('design-supervision', 'interior-design', 'Авторский надзор',           60),
  ('design-replan',      'interior-design', 'Перепланировка / зонирование',70),

  -- 32. Демонтаж
  ('demo-walls',         'demolition', 'Демонтаж стен / перегородок',  10),
  ('demo-tile',          'demolition', 'Демонтаж плитки',              20),
  ('demo-floor',         'demolition', 'Демонтаж напольных покрытий',  30),
  ('demo-wallpaper',     'demolition', 'Демонтаж обоев / штукатурки',  40),
  ('demo-windows-doors', 'demolition', 'Демонтаж окон / дверей',       50),
  ('demo-plumbing',      'demolition', 'Демонтаж сантехники',          60),
  ('demo-ceilings',      'demolition', 'Демонтаж потолков',            70),
  ('demo-buildings',     'demolition', 'Снос построек / домов',        80),
  ('debris-removal',     'demolition', 'Вывоз строительного мусора',   90);
