-- 0039_add_5_categories_from_competitor.sql
-- По запросу пользователя из скринов конкурента — недостающие L2.
-- Грузчики/переезды, ремонт бытовой техники, стекло, спутниковое ТВ,
-- видеонаблюдение/охрана. Каждая категория с 5-8 L3.

INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_visible, is_featured) VALUES
  ('movers',            'construction', 'Грузчики и переезды',         'Truck',        330, true, false),
  ('appliance-repair',  'construction', 'Ремонт бытовой техники',      'Refrigerator', 340, true, false),
  ('glass',             'construction', 'Стеклянные работы',           'Square',       350, true, false),
  ('satellite-tv',      'construction', 'Спутниковое ТВ и антенны',    'Antenna',      360, true, false),
  ('security-systems',  'construction', 'Видеонаблюдение и охрана',    'Camera',       370, true, false)
ON CONFLICT (id) DO UPDATE SET
  l1_id      = EXCLUDED.l1_id,
  name_ru    = EXCLUDED.name_ru,
  icon       = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_visible = EXCLUDED.is_visible,
  is_featured = EXCLUDED.is_featured,
  is_active  = true;

INSERT INTO public.categories_l3 (id, l2_id, name_ru, sort_order) VALUES
  ('move-apt',          'movers', 'Переезд квартиры',                   10),
  ('move-office',       'movers', 'Переезд офиса',                      20),
  ('lift-heavy',        'movers', 'Подъём / спуск техники, мебели',     30),
  ('mover-assembly',    'movers', 'Сборка-разборка при переезде',       40),
  ('movers-hour',       'movers', 'Грузчики на час',                    50),
  ('truck-with-movers', 'movers', 'Газель с грузчиками',                60),

  ('appl-washing',      'appliance-repair', 'Стиральная машина',         10),
  ('appl-fridge',       'appliance-repair', 'Холодильник',               20),
  ('appl-dishwasher',   'appliance-repair', 'Посудомоечная машина',      30),
  ('appl-stove',        'appliance-repair', 'Плита (газовая/электро)',   40),
  ('appl-microwave',    'appliance-repair', 'Микроволновая печь',        50),
  ('appl-tv',           'appliance-repair', 'Телевизор',                 60),
  ('appl-ac',           'appliance-repair', 'Кондиционер',               70),
  ('appl-small',        'appliance-repair', 'Мелкая бытовая техника',    80),

  ('glass-partition',   'glass', 'Стеклянные перегородки',               10),
  ('glass-doors',       'glass', 'Стеклянные двери',                     20),
  ('glass-railing',     'glass', 'Стеклянные ограждения (балкон)',       30),
  ('glass-shower',      'glass', 'Стеклянные душевые',                   40),
  ('glass-mirror',      'glass', 'Зеркала на заказ',                     50),
  ('glass-fitting',     'glass', 'Фурнитура и установка',                60),

  ('sat-install',       'satellite-tv', 'Установка спутниковой антенны', 10),
  ('sat-tricolor',      'satellite-tv', 'Триколор ТВ',                   20),
  ('sat-ntv',           'satellite-tv', 'НТВ+',                          30),
  ('sat-otv',           'satellite-tv', 'Эфирные антенны',               40),
  ('sat-iptv',          'satellite-tv', 'IPTV / интернет-ТВ',            50),
  ('sat-amp',           'satellite-tv', 'Усилитель сигнала',             60),

  ('cctv-install-pro',  'security-systems', 'Установка видеокамер',      10),
  ('cctv-cloud',        'security-systems', 'Облачное видеонаблюдение',  20),
  ('alarm-security',    'security-systems', 'Охранная сигнализация',     30),
  ('alarm-fire',        'security-systems', 'Пожарная сигнализация',     40),
  ('access-control',    'security-systems', 'Контроль доступа',          50),
  ('intercom-pro',      'security-systems', 'Домофоны',                  60);

-- Привязываем существующих мастеров к новым категориям (random, до 5 на мастера).
INSERT INTO public.master_categories (master_id, l2_id, l3_ids, category_bio, pricing_mode, category_radius_km)
SELECT
  mp.user_id,
  rnd.l2_id,
  ARRAY[]::text[],
  NULL,
  'on_quote'::master_pricing_mode,
  25
FROM public.master_profiles mp
CROSS JOIN LATERAL (
  SELECT l.id AS l2_id
  FROM public.categories_l2 l
  WHERE l.is_visible = true
    AND l.id IN ('movers', 'appliance-repair', 'glass', 'satellite-tv', 'security-systems')
    AND NOT EXISTS (
      SELECT 1 FROM public.master_categories mc
      WHERE mc.master_id = mp.user_id AND mc.l2_id = l.id
    )
  ORDER BY random()
  LIMIT GREATEST(0, 5 - (SELECT COUNT(*) FROM public.master_categories WHERE master_id = mp.user_id))
) rnd
WHERE mp.status = 'active';
