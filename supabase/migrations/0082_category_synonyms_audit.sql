-- Migration 0082 — массовое расширение тезауруса category_terms.
--
-- Why. User feedback 2026-05-16: «не вижу обычной категории Обои при поиске.
-- Надо категории и подкатегории проверить и найти подобные проблемы и исправить».
--
-- Аудит (после миграции 0062) выявил два класса проблем:
--
-- 1) **Мёртвые синонимы.** 12 синонимов мапятся на L2 `appliances` и `cleaning`
--    (L1=home-services, is_visible=false по Product scope MVP в CLAUDE.md).
--    Search-RPC исключает is_visible=false через FTS-фильтр → запросы вроде
--    «стиралка», «холодильник», «уборка», «химчистка» молча возвращают 0
--    результатов. Эти L2 не вернутся в скоп до Sprint home-services.
--    Решение: перенацелить термы на construction-аналоги:
--      - appliances → appliance-repair (Ремонт бытовой техники).
--      - cleaning → cleaning-post-renovation (Уборка после ремонта).
--
-- 2) **Категории без синонимов.** 24 из 34 видимых L2 имеют 0 термов. Запросы
--    «забор», «крыша», «ламинат», «потолок», «гипсокартон», «штора», «стяжка»
--    и т.п. попадают только в FTS+trigram по name_ru, но имя ≠ запрос
--    (e.g. fences-gates="Заборы и ворота", запрос "забор" — стеммер найдёт,
--    но "ворота" — не найдёт; floors="Полы и стяжка", запрос "ламинат" — пусто).
--    Решение: insert 100–150 строк синонимов для каждой L2 (минимум 3–5,
--    максимум по необходимости).
--
-- Источник терминов: research/SEARCH_AUDIT.md эталон Thumbtack + конкретные
-- русскоязычные запросы которые видны в Wordstat/Avito Услуги/Profi.ru
-- для строительных вертикалей в РФ.

-- ============================================================================
-- 1. Remap dead synonyms — hidden L2 → visible L2-аналог
-- ============================================================================

-- appliances (Бытовая техника, hidden) → appliance-repair (Ремонт бытовой техники, visible)
UPDATE public.category_terms SET l2_id = 'appliance-repair' WHERE l2_id = 'appliances';

-- cleaning (Клининг, hidden) → cleaning-post-renovation (Уборка после ремонта, visible)
UPDATE public.category_terms SET l2_id = 'cleaning-post-renovation' WHERE l2_id = 'cleaning';

-- ============================================================================
-- 2. Insert missing L2 synonyms — 24 categories
-- ============================================================================

-- appliance-repair (Ремонт бытовой техники) — добор поверх remap'нутых
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('ремонт техники',    'appliance-repair', 100),
  ('ремонт стиралки',   'appliance-repair', 100),
  ('ремонт холодильника', 'appliance-repair', 100),
  ('телевизор',         'appliance-repair', 90),
  ('тв',                'appliance-repair', 80);

-- baths-pools (Бани, бассейны и хамамы)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('баня',     'baths-pools', 100),
  ('сауна',    'baths-pools', 100),
  ('бассейн',  'baths-pools', 100),
  ('хамам',    'baths-pools', 100),
  ('парная',   'baths-pools', 90);

-- ceilings (Потолки)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('потолок',          'ceilings', 100),
  ('потолки',          'ceilings', 100),
  ('подвесной потолок', 'ceilings', 100),
  ('армстронг',        'ceilings', 90),
  ('реечный потолок',  'ceilings', 90);

-- cleaning-post-renovation (Уборка после ремонта) — добор поверх remap'нутых
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('уборка после ремонта', 'cleaning-post-renovation', 100),
  ('клининг',              'cleaning-post-renovation', 100),
  ('мытьё',                'cleaning-post-renovation', 80);

-- concrete (Бетонные работы)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('бетон',     'concrete', 100),
  ('бетонщик',  'concrete', 100),
  ('стяжка',    'concrete', 100),
  ('залить',    'concrete', 90),
  ('фундамент', 'concrete', 100),
  ('армопояс',  'concrete', 90);

-- curtains-blinds (Шторы и жалюзи)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('шторы',          'curtains-blinds', 100),
  ('штора',          'curtains-blinds', 100),
  ('жалюзи',         'curtains-blinds', 100),
  ('карниз',         'curtains-blinds', 100),
  ('ролеты',         'curtains-blinds', 100),
  ('рулонные шторы', 'curtains-blinds', 100),
  ('тюль',           'curtains-blinds', 90);

-- demolition (Демонтаж)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('демонтаж',      'demolition', 100),
  ('снести',        'demolition', 100),
  ('разобрать',     'demolition', 90),
  ('сломать стену', 'demolition', 100),
  ('сбить плитку',  'demolition', 100);

-- drilling-wells (Бурение скважин и колодцы)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('скважина',  'drilling-wells', 100),
  ('колодец',   'drilling-wells', 100),
  ('пробурить', 'drilling-wells', 100),
  ('водоснабжение скважина', 'drilling-wells', 80);

-- drywall (Гипсокартон)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('гипсокартон', 'drywall', 100),
  ('гкл',         'drywall', 100),
  ('перегородка', 'drywall', 100),
  ('короб',       'drywall', 90);

-- facade (Фасадные работы)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('фасад',     'facade', 100),
  ('сайдинг',   'facade', 100),
  ('облицовка', 'facade', 100),
  ('навесной фасад', 'facade', 90),
  ('декор стен снаружи', 'facade', 80);

-- fences-gates (Заборы и ворота)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('забор',       'fences-gates', 100),
  ('заборы',      'fences-gates', 100),
  ('ворота',      'fences-gates', 100),
  ('калитка',     'fences-gates', 100),
  ('штакетник',   'fences-gates', 100),
  ('профнастил',  'fences-gates', 100),
  ('сетка-рабица', 'fences-gates', 100);

-- floors (Полы и стяжка)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('пол',         'floors', 100),
  ('полы',        'floors', 100),
  ('ламинат',     'floors', 100),
  ('паркет',      'floors', 100),
  ('линолеум',    'floors', 100),
  ('напольное покрытие', 'floors', 90),
  ('кварц-винил', 'floors', 90),
  ('наливной пол', 'floors', 100);

-- furniture (Мебель и сборка)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('мебель',  'furniture', 100),
  ('сборка',  'furniture', 100),
  ('собрать', 'furniture', 100),
  ('шкаф',    'furniture', 100),
  ('кухня',   'furniture', 90),
  ('икея',    'furniture', 90),
  ('кровать', 'furniture', 90);

-- general-construction (Строительство)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('построить',     'general-construction', 100),
  ('стройка',       'general-construction', 100),
  ('дом',           'general-construction', 90),
  ('коттедж',       'general-construction', 100),
  ('строительство дома', 'general-construction', 100),
  ('каркасный дом', 'general-construction', 100);

-- handyman (Мастер на час)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('мастер на час', 'handyman', 100),
  ('муж на час',    'handyman', 100),
  ('повесить',      'handyman', 100),
  ('прибить',       'handyman', 100),
  ('помощь по дому', 'handyman', 100),
  ('мелкий ремонт', 'handyman', 100);

-- insulation (Утепление и изоляция)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('утепление', 'insulation', 100),
  ('утеплить',  'insulation', 100),
  ('изоляция',  'insulation', 100),
  ('пеноплекс', 'insulation', 100),
  ('минвата',   'insulation', 100),
  ('эковата',   'insulation', 100),
  ('пенопласт', 'insulation', 90);

-- interior-design (Дизайн интерьера)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('дизайн',     'interior-design', 100),
  ('дизайнер',   'interior-design', 100),
  ('интерьер',   'interior-design', 100),
  ('проект',     'interior-design', 80),
  ('3d визуализация', 'interior-design', 90);

-- landscape (Благоустройство и ландшафт)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('ландшафт',         'landscape', 100),
  ('благоустройство',  'landscape', 100),
  ('газон',            'landscape', 100),
  ('дорожки',          'landscape', 100),
  ('тротуарная плитка', 'landscape', 100),
  ('двор',             'landscape', 80);

-- masonry (Каменщики и кладка)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('кладка',     'masonry', 100),
  ('каменщик',   'masonry', 100),
  ('кирпич',     'masonry', 100),
  ('газоблок',   'masonry', 100),
  ('пеноблок',   'masonry', 100),
  ('камень',     'masonry', 80);

-- renovation (Ремонт и отделка)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('ремонт',              'renovation', 100),
  ('отделка',             'renovation', 100),
  ('ремонт квартиры',     'renovation', 100),
  ('ремонт ванной',       'renovation', 100),
  ('ремонт кухни',        'renovation', 100),
  ('под ключ',            'renovation', 100),
  ('косметический ремонт', 'renovation', 100),
  ('капремонт',           'renovation', 100);

-- roofing (Кровля)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('крыша',           'roofing', 100),
  ('кровля',          'roofing', 100),
  ('профлист',        'roofing', 100),
  ('металлочерепица', 'roofing', 100),
  ('ондулин',         'roofing', 100),
  ('битумная черепица', 'roofing', 100),
  ('водосток',        'roofing', 90);

-- satellite-tv (Спутниковое ТВ и антенны)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('антенна',      'satellite-tv', 100),
  ('спутник',      'satellite-tv', 100),
  ('тарелка',      'satellite-tv', 100),
  ('триколор',     'satellite-tv', 100),
  ('нтв плюс',     'satellite-tv', 100),
  ('эфирное тв',   'satellite-tv', 90);

-- tension-ceilings (Натяжные потолки)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('натяжные потолки', 'tension-ceilings', 100),
  ('натяжной потолок', 'tension-ceilings', 100),
  ('пвх потолок',      'tension-ceilings', 100),
  ('тканевый потолок', 'tension-ceilings', 100);

-- welding (Сварочные работы)
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('сварка',     'welding', 100),
  ('сварщик',    'welding', 100),
  ('приварить',  'welding', 100),
  ('сварочные работы', 'welding', 100),
  ('сварка металла', 'welding', 90);

-- ============================================================================
-- 3. Comment update
-- ============================================================================

COMMENT ON TABLE public.category_terms IS
  'Тезаурус синонимов для умного поиска. Один term → одна категория (L2 или L3). Many-to-many через несколько строк. Эталон: Thumbtack expanded list ~1000 terms. Аудит 0082 (2026-05-16): расширили с ~60 до ~170 термов; remap'нули мёртвые из hidden L2.';
