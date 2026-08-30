-- Migration 0063 — seed thesaurus синонимов для умного поиска (P0-NEW).
--
-- Контекст: research/SEARCH_AUDIT.md — слой synonyms покрывает кейсы где
-- слово запроса НЕ встречается в name_ru категории. Например:
--   - «протекает кран» → сантехник (в name «Сантехника» нет слова «кран»)
--   - «холодильник не работает» → ремонт бытовой техники
--
-- На MVP — ~50 наиболее очевидных терминов. Дальше расширяется по
-- мере появления «no-result queries» в логах.

-- Сантехника — обиходные термины
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('кран',          'plumbing', 100),
  ('кран течет',    'plumbing', 100),
  ('протечка',      'plumbing', 100),
  ('течет',         'plumbing', 90),
  ('труба',         'plumbing', 100),
  ('трубы',         'plumbing', 100),
  ('засор',         'plumbing', 100),
  ('унитаз',        'plumbing', 100),
  ('ванна',         'plumbing', 100),
  ('бойлер',        'plumbing', 100),
  ('водонагреватель','plumbing', 100),
  ('канализация',   'plumbing', 90),
  ('сантехник',     'plumbing', 100);

-- Электрика
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('розетка',       'electrical', 100),
  ('розетки',       'electrical', 100),
  ('выключатель',   'electrical', 100),
  ('проводка',      'electrical', 100),
  ('свет',          'electrical', 70),
  ('лампочка',      'electrical', 90),
  ('люстра',        'electrical', 100),
  ('щиток',         'electrical', 100),
  ('замыкание',     'electrical', 100),
  ('узо',           'electrical', 100),
  ('заземление',    'electrical', 100),
  ('электрик',      'electrical', 100);

-- Видеонаблюдение / охрана / замки — главный кейс «камера → видеонаблюдение»
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('камера',          'security-systems', 100),
  ('камеры',          'security-systems', 100),
  ('видеокамера',     'security-systems', 100),
  ('видеонаблюдение', 'security-systems', 100),
  ('cctv',            'security-systems', 100),
  ('охрана',          'security-systems', 100),
  ('сигнализация',    'security-systems', 100),
  ('домофон',         'security-systems', 100),
  ('замок',           'locks-security', 100);

-- Бытовая техника
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('холодильник',     'appliances', 100),
  ('стиральная',      'appliances', 100),
  ('стиралка',        'appliances', 100),
  ('посудомойка',     'appliances', 100),
  ('плита',           'appliances', 100),
  ('духовка',         'appliances', 100),
  ('микроволновка',   'appliances', 100);

-- Климат и отопление
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('кондиционер',     'climate', 100),
  ('сплит',           'climate', 100),
  ('сплит-система',   'climate', 100),
  ('котел',           'climate', 100),
  ('отопление',       'climate', 100);

-- Уборка
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('убрать',        'cleaning', 100),
  ('уборка',        'cleaning', 100),
  ('помыть окна',   'cleaning', 100),
  ('окна помыть',   'cleaning', 100),
  ('генеральная',   'cleaning', 100),
  ('химчистка',     'cleaning', 90);

-- Перевозки / грузчики
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('переезд',       'movers', 100),
  ('грузчики',      'movers', 100),
  ('перевезти',     'cargo', 100),
  ('газель',        'cargo', 100),
  ('такелаж',       'cargo', 100);

-- Авто
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('машина не заводится', 'auto-service', 100),
  ('развал',              'tire-service', 100),
  ('шиномонтаж',          'tire-service', 100),
  ('покрасить машину',    'body-paint', 100),
  ('помыть машину',       'car-wash', 100);

-- Красота
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('подстричься',   'hair', 100),
  ('стрижка',       'hair', 100),
  ('маникюр',       'nails', 100),
  ('педикюр',       'nails', 100),
  ('брови',         'lashes-brows', 100),
  ('массаж',        'massage', 100);

-- IT / компьютеры / сайты
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('компьютер',     'computer-help', 100),
  ('ноутбук',       'computer-help', 100),
  ('пк не работает','computer-help', 100),
  ('винда',         'computer-help', 100),
  ('windows',       'computer-help', 100),
  ('сайт',          'dev-sites', 100),
  ('лендинг',       'dev-sites', 100);

-- Окна / двери
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('окно',          'windows', 100),
  ('окна',          'windows', 100),
  ('пластиковые окна', 'windows', 100),
  ('дверь',         'doors', 100),
  ('двери',         'doors', 100);

-- Плитка
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('плитка',        'tiling', 100),
  ('кафель',        'tiling', 100);

-- Покраска
INSERT INTO public.category_terms (term, l2_id, weight) VALUES
  ('покрасить стены', 'painting', 100),
  ('обои',            'finishing', 100);
