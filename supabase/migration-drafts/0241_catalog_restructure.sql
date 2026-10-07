-- 0241: перестройка каталога (№292, DECISION владельца 2026-10-07).
--
-- Только данные каталога: categories_l1 / categories_l2 / categories_l3 /
-- category_terms. Схема, функции, права и RLS не меняются. id существующих
-- подкатегорий сохраняются, ничего не сливается и не удаляется (кроме двух
-- синонимов-дублей, см. п.7).
--
-- Живое состояние снято read-only с базы 2026-10-07: в разделах
-- tech-security, auto, cargo — 0 заданий, 0 категорий специалистов;
-- orders.l3_ids / master_categories.l3_ids / master_services.l3_id не
-- ссылаются на переносимые услуги (проверяется ещё раз в предусловиях).
--
-- Было → стало:
--  1. Порядок разделов (sort_order 10…130): handyman-moving, home-services,
--     cargo, utilities, repair-finishing, construction, home-appliances,
--     interior, auto, tech-security, computer-help, tutors, legal-accounting.
--     Было: repair-finishing 1, utilities 2, construction 3, home-services 4,
--     interior 5, tech-security 6, handyman-moving 7, cargo 8,
--     computer-help 10, auto 11, tutors 13, legal-accounting 17.
--  2. Новый раздел home-appliances «Ремонт бытовой техники» (icon
--     WashingMachine — есть в src/lib/category-icons.ts). appliance-repair:
--     l1_id tech-security → home-appliances; её услуги (categories_l3.l2_id =
--     'appliance-repair') уходят вместе с ней без правок.
--  3. auto: «Ремонт транспорта» → «Автосервис»;
--     car-repair: «Автосервис и ремонт» → «Ремонт двигателя и ТО».
--  4. tech-security: «Техника и безопасность» → «Замки, камеры, антенны»;
--     locks-security: «Замки и безопасность» → «Замки и вскрытие дверей»;
--     security-systems: «Видеонаблюдение и охрана» → «Видеонаблюдение»;
--     новая intercom-alarm «Домофоны и сигнализация» (icon ShieldCheck);
--     из security-systems в неё переносятся услуги alarm-security («Охранная
--     сигнализация»), alarm-fire («Пожарная сигнализация»), access-control
--     («Контроль доступа»), intercom-pro («Домофоны») и синонимы «домофон»,
--     «сигнализация» (по id, строки сохраняются); «СКУД» синонимом не было —
--     добавлен «скуд», а также «видеодомофон».
--     satellite-tv без изменений.
--  5. Порядок подкатегорий:
--     home-services: cleaning 10, housekeeping 20, cleaning-post-renovation
--       30, laundry 40, disposal 50, garden 60, pest-control 70, caregivers 80;
--     cargo: movers 10, cargo-transport 20, courier-delivery 30, buy-deliver
--       40, food-delivery 50, tow-truck 60, (новая) driver-hourly 70;
--     repair-finishing (видимые): renovation 10, painting 20, wallpaper 30,
--       tiling 40, floors 50, drywall 60, doors 70, windows 80; скрытые
--       (finishing, windows-doors, decorative-installations, plaster-putty,
--       glass) не трогаются;
--     construction: general-construction 240 → 170 (перед insulation 180),
--       остальные как есть.
--  6. Новые подкатегории (is_active, is_visible = true как у остальных
--     активных; open_responses = false — по умолчанию, fail-closed):
--     driver-hourly «Водитель на час» (cargo, icon Car) — услуги
--       driver-own-car, driver-sober, driver-car-transfer;
--     roadside-help «Помощь на дороге» (auto, icon TrafficCone, sort 60) —
--       услуги road-jumpstart, road-fuel, road-wheel.
--     У каждой видимой активной подкатегории на базе есть услуги (0 без
--     услуг), поэтому услуги заведены и у новых.
--  7. Синонимы:
--     car-repair: «автосервис» уже есть (weight 100); «сто» не добавлен — ломал поиск «стол», «столяр»;
--     pc-repair + «замена экрана телефона» («ремонт телефона» уже есть,
--       weight 60 — не меняется);
--     tow-truck — «эвакуатор» уже есть (100), не меняется;
--     driver-hourly, roadside-help, intercom-alarm — новые слова;
--     locks-security − «видеонаблюдение», − «сигнализация»: после
--       переименования в «Замки и вскрытие дверей» они уводили бы к замкам;
--       у security-systems / intercom-alarm эти слова есть. Откат
--       возвращает обе строки с прежними id и created_at.
--  8. xtrud_private.ai_classify_catalog() и admin_list_categories() читают
--     таблицы динамически (ORDER BY l1.sort_order, l2.sort_order) — правки
--     не нужны; проверено прогоном BEGIN…ROLLBACK.
--
-- Журнал admin_actions не пишется: миграция владельца базы.
-- Откат: 0241_catalog_restructure_rollback.sql (возвращает имена, порядок,
-- l1_id, услуги и синонимы к состоянию до 0241; правки админки, сделанные
-- после 0241 над этими же строками, откат перезапишет).
-- После применения: EXPO_PUBLIC_API_URL=https://api.xtrud.pro npm run
-- catalog:generate, затем npm run catalog:check.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_bad text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0241_must_run_as_postgres';
  END IF;

  -- Новые id свободны.
  IF EXISTS (SELECT 1 FROM public.categories_l1 WHERE id = 'home-appliances') THEN
    RAISE EXCEPTION '0241_already_applied_or_l1_taken: home-appliances';
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories_l2
              WHERE id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')) THEN
    RAISE EXCEPTION '0241_l2_taken';
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories_l3
              WHERE id IN ('driver-own-car', 'driver-sober', 'driver-car-transfer',
                           'road-jumpstart', 'road-fuel', 'road-wheel')) THEN
    RAISE EXCEPTION '0241_l3_taken';
  END IF;

  -- Разделы: ровно эти 12, все активны, с прежними именами и порядком.
  SELECT string_agg(coalesce(e.id, c.id), ', ') INTO v_bad
    FROM (VALUES
      ('repair-finishing', 'Ремонт и отделка', 1),
      ('utilities', 'Сантехника и электрика', 2),
      ('construction', 'Строительство и участок', 3),
      ('home-services', 'Уборка и помощь по хозяйству', 4),
      ('interior', 'Мебель и интерьер', 5),
      ('tech-security', 'Техника и безопасность', 6),
      ('handyman-moving', 'Мастер на час и разнорабочие', 7),
      ('cargo', 'Перевозки и доставка', 8),
      ('computer-help', 'Компьютерная помощь', 10),
      ('auto', 'Ремонт транспорта', 11),
      ('tutors', 'Репетиторы и обучение', 13),
      ('legal-accounting', 'Юристы и бухгалтеры', 17)
    ) AS e(id, name_ru, sort_order)
    FULL JOIN public.categories_l1 c ON c.id = e.id
   WHERE e.id IS NULL OR c.id IS NULL
      OR c.name_ru IS DISTINCT FROM e.name_ru
      OR c.sort_order IS DISTINCT FROM e.sort_order
      OR NOT c.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0241_l1_state_changed: %', v_bad;
  END IF;

  -- Подкатегории, которые меняются: прежние раздел, имя, порядок.
  SELECT string_agg(e.id, ', ') INTO v_bad
    FROM (VALUES
      ('appliance-repair', 'tech-security', 'Ремонт бытовой техники', 340),
      ('car-repair', 'auto', 'Автосервис и ремонт', 10),
      ('locks-security', 'tech-security', 'Замки и безопасность', 90),
      ('security-systems', 'tech-security', 'Видеонаблюдение и охрана', 370),
      ('satellite-tv', 'tech-security', 'Спутниковое ТВ и антенны', 360),
      ('cleaning', 'home-services', 'Уборка (клининг)', 1),
      ('housekeeping', 'home-services', 'Помощь по хозяйству', 70),
      ('cleaning-post-renovation', 'home-services', 'Уборка после ремонта', 60),
      ('laundry', 'home-services', 'Стирка и чистка', 2),
      ('disposal', 'home-services', 'Вывоз мусора', 3),
      ('garden', 'home-services', 'Сад и участок', 4),
      ('pest-control', 'home-services', 'Дезинфекция и борьба с вредителями', 6),
      ('caregivers', 'home-services', 'Няни и сиделки', 80),
      ('movers', 'cargo', 'Грузчики и переезды', 20),
      ('cargo-transport', 'cargo', 'Грузоперевозки', 10),
      ('courier-delivery', 'cargo', 'Доставка документов и посылок', 40),
      ('buy-deliver', 'cargo', 'Купить и доставить', 50),
      ('food-delivery', 'cargo', 'Доставка еды', 60),
      ('tow-truck', 'cargo', 'Эвакуатор', 30),
      ('renovation', 'repair-finishing', 'Ремонт и отделка', 40),
      ('painting', 'repair-finishing', 'Штукатурка и покраска', 100),
      ('wallpaper', 'repair-finishing', 'Обои', 105),
      ('tiling', 'repair-finishing', 'Плитка и мозаика', 130),
      ('floors', 'repair-finishing', 'Полы и стяжка', 140),
      ('drywall', 'repair-finishing', 'Гипсокартон', 120),
      ('doors', 'repair-finishing', 'Двери', 80),
      ('windows', 'repair-finishing', 'Окна и остекление', 70),
      ('general-construction', 'construction', 'Строительство', 240)
    ) AS e(id, l1_id, name_ru, sort_order)
    LEFT JOIN public.categories_l2 c ON c.id = e.id
   WHERE c.id IS NULL
      OR c.l1_id IS DISTINCT FROM e.l1_id
      OR c.name_ru IS DISTINCT FROM e.name_ru
      OR c.sort_order IS DISTINCT FROM e.sort_order
      OR NOT c.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0241_l2_state_changed: %', v_bad;
  END IF;

  -- Переносимые услуги стоят в security-systems.
  IF (SELECT count(*) FROM public.categories_l3
       WHERE l2_id = 'security-systems'
         AND id IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro')) <> 4 THEN
    RAISE EXCEPTION '0241_l3_state_changed';
  END IF;
  -- На переносимые услуги нет ссылок (иначе задание/специалист остались бы с
  -- услугой из чужой подкатегории).
  IF EXISTS (SELECT 1 FROM public.orders
              WHERE l3_ids && ARRAY['alarm-security', 'alarm-fire', 'access-control', 'intercom-pro'])
     OR EXISTS (SELECT 1 FROM public.master_categories
              WHERE l3_ids && ARRAY['alarm-security', 'alarm-fire', 'access-control', 'intercom-pro'])
     OR EXISTS (SELECT 1 FROM public.master_services
              WHERE l3_id IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro')) THEN
    RAISE EXCEPTION '0241_moved_l3_referenced';
  END IF;

  -- Синонимы, которые переносятся / удаляются, — те самые строки.
  IF (SELECT count(*) FROM public.category_terms
       WHERE (id = 'c87c8500-d2c5-451f-b725-fd040f8953e6' AND l2_id = 'security-systems'
              AND l3_id IS NULL AND term = 'домофон')
          OR (id = '56188cdf-b692-4938-acee-dbefc9a55670' AND l2_id = 'security-systems'
              AND l3_id IS NULL AND term = 'сигнализация')
          OR (id = '7027cfd6-fa5a-4582-917b-512a1768f6b1' AND l2_id = 'locks-security'
              AND l3_id IS NULL AND term = 'видеонаблюдение' AND weight = 100
              AND created_at = '2026-05-19 07:45:08.35977+00')
          OR (id = 'c49c3ecf-3b75-4e10-978e-9a9beae36562' AND l2_id = 'locks-security'
              AND l3_id IS NULL AND term = 'сигнализация' AND weight = 100
              AND created_at = '2026-05-19 07:45:08.35977+00')) <> 4 THEN
    RAISE EXCEPTION '0241_terms_state_changed';
  END IF;
  -- Добавляемые слова ещё не заведены (ни у кого).
  IF EXISTS (SELECT 1 FROM public.category_terms
              WHERE lower(term) IN ('замена экрана телефона', 'скуд', 'видеодомофон',
                                    'водитель', 'водитель на час', 'трезвый водитель',
                                    'личный водитель', 'перегнать машину', 'перегон автомобиля',
                                    'помощь на дороге', 'прикурить', 'прикурить машину',
                                    'сел аккумулятор', 'подвезти бензин', 'подвезти топливо',
                                    'закончился бензин', 'техпомощь')) THEN
    RAISE EXCEPTION '0241_new_terms_taken';
  END IF;
  -- Иконки, на которые ссылаемся, уже используются каталогом (значит, есть в
  -- src/lib/category-icons.ts и проходят catalog:check).
  IF (SELECT count(DISTINCT icon) FROM (
        SELECT icon FROM public.categories_l1 UNION ALL SELECT icon FROM public.categories_l2) i
       WHERE icon IN ('WashingMachine', 'ShieldCheck', 'Car', 'TrafficCone')) <> 4 THEN
    RAISE EXCEPTION '0241_icon_not_in_catalog';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Новый раздел и перенос appliance-repair.
-- ---------------------------------------------------------------------------
INSERT INTO public.categories_l1 (id, name_ru, icon, sort_order, is_active)
VALUES ('home-appliances', 'Ремонт бытовой техники', 'WashingMachine', 70, true);

UPDATE public.categories_l2 SET l1_id = 'home-appliances' WHERE id = 'appliance-repair';

-- ---------------------------------------------------------------------------
-- 1. Порядок разделов.
-- ---------------------------------------------------------------------------
UPDATE public.categories_l1 c SET sort_order = v.sort_order
  FROM (VALUES
    ('handyman-moving', 10), ('home-services', 20), ('cargo', 30), ('utilities', 40),
    ('repair-finishing', 50), ('construction', 60), ('interior', 80), ('auto', 90),
    ('tech-security', 100), ('computer-help', 110), ('tutors', 120), ('legal-accounting', 130)
  ) AS v(id, sort_order)
 WHERE c.id = v.id;

-- ---------------------------------------------------------------------------
-- 3–4. Имена.
-- ---------------------------------------------------------------------------
UPDATE public.categories_l1 SET name_ru = 'Автосервис' WHERE id = 'auto';
UPDATE public.categories_l1 SET name_ru = 'Замки, камеры, антенны' WHERE id = 'tech-security';
UPDATE public.categories_l2 SET name_ru = 'Ремонт двигателя и ТО' WHERE id = 'car-repair';
UPDATE public.categories_l2 SET name_ru = 'Замки и вскрытие дверей' WHERE id = 'locks-security';
UPDATE public.categories_l2 SET name_ru = 'Видеонаблюдение' WHERE id = 'security-systems';

-- ---------------------------------------------------------------------------
-- 4, 6. Новые подкатегории.
-- ---------------------------------------------------------------------------
INSERT INTO public.categories_l2
  (id, l1_id, name_ru, icon, sort_order, is_active, is_visible, is_featured, open_responses)
VALUES
  ('intercom-alarm', 'tech-security', 'Домофоны и сигнализация', 'ShieldCheck', 380, true, true, false, false),
  ('driver-hourly', 'cargo', 'Водитель на час', 'Car', 70, true, true, false, false),
  ('roadside-help', 'auto', 'Помощь на дороге', 'TrafficCone', 60, true, true, false, false);

-- Услуги из security-systems → intercom-alarm (sort_order прежний).
UPDATE public.categories_l3 SET l2_id = 'intercom-alarm'
 WHERE l2_id = 'security-systems'
   AND id IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro');

INSERT INTO public.categories_l3 (id, l2_id, name_ru, urgency_typical, sort_order, is_active)
VALUES
  ('driver-own-car', 'driver-hourly', 'Водитель на ваш автомобиль', 'week', 10, true),
  ('driver-sober', 'driver-hourly', 'Трезвый водитель', 'urgent', 20, true),
  ('driver-car-transfer', 'driver-hourly', 'Перегнать автомобиль', 'week', 30, true),
  ('road-jumpstart', 'roadside-help', 'Прикурить автомобиль', 'urgent', 10, true),
  ('road-fuel', 'roadside-help', 'Подвезти топливо', 'urgent', 20, true),
  ('road-wheel', 'roadside-help', 'Заменить колесо на дороге', 'urgent', 30, true);

-- ---------------------------------------------------------------------------
-- 5. Порядок подкатегорий.
-- ---------------------------------------------------------------------------
UPDATE public.categories_l2 c SET sort_order = v.sort_order
  FROM (VALUES
    ('cleaning', 10), ('housekeeping', 20), ('cleaning-post-renovation', 30), ('laundry', 40),
    ('disposal', 50), ('garden', 60), ('pest-control', 70), ('caregivers', 80),
    ('movers', 10), ('cargo-transport', 20), ('courier-delivery', 30), ('buy-deliver', 40),
    ('food-delivery', 50), ('tow-truck', 60),
    ('renovation', 10), ('painting', 20), ('wallpaper', 30), ('tiling', 40),
    ('floors', 50), ('drywall', 60), ('doors', 70), ('windows', 80),
    ('general-construction', 170)
  ) AS v(id, sort_order)
 WHERE c.id = v.id;

-- ---------------------------------------------------------------------------
-- 7. Синонимы.
-- ---------------------------------------------------------------------------
UPDATE public.category_terms SET l2_id = 'intercom-alarm'
 WHERE id IN ('c87c8500-d2c5-451f-b725-fd040f8953e6',   -- домофон
              '56188cdf-b692-4938-acee-dbefc9a55670');  -- сигнализация

DELETE FROM public.category_terms
 WHERE id IN ('7027cfd6-fa5a-4582-917b-512a1768f6b1',   -- locks-security: видеонаблюдение
              'c49c3ecf-3b75-4e10-978e-9a9beae36562');  -- locks-security: сигнализация

INSERT INTO public.category_terms (l2_id, term, weight) VALUES
  ('intercom-alarm', 'скуд', 100),
  ('intercom-alarm', 'видеодомофон', 90),
  ('pc-repair', 'замена экрана телефона', 90),
  ('driver-hourly', 'водитель', 100),
  ('driver-hourly', 'водитель на час', 100),
  ('driver-hourly', 'трезвый водитель', 100),
  ('driver-hourly', 'личный водитель', 90),
  ('driver-hourly', 'перегнать машину', 90),
  ('driver-hourly', 'перегон автомобиля', 80),
  ('roadside-help', 'помощь на дороге', 100),
  ('roadside-help', 'прикурить', 100),
  ('roadside-help', 'прикурить машину', 100),
  ('roadside-help', 'сел аккумулятор', 90),
  ('roadside-help', 'подвезти бензин', 100),
  ('roadside-help', 'подвезти топливо', 90),
  ('roadside-help', 'закончился бензин', 90),
  ('roadside-help', 'техпомощь', 80);

-- ---------------------------------------------------------------------------
-- Постпроверки.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_order text;
BEGIN
  SELECT string_agg(id, ',' ORDER BY sort_order, id) INTO v_order
    FROM public.categories_l1 WHERE is_active;
  IF v_order IS DISTINCT FROM 'handyman-moving,home-services,cargo,utilities,repair-finishing,'
       'construction,home-appliances,interior,auto,tech-security,computer-help,tutors,legal-accounting' THEN
    RAISE EXCEPTION '0241_post_l1_order: %', v_order;
  END IF;

  SELECT string_agg(id, ',' ORDER BY sort_order, id) INTO v_order
    FROM public.categories_l2 WHERE l1_id = 'home-services' AND is_active AND is_visible;
  IF v_order IS DISTINCT FROM 'cleaning,housekeeping,cleaning-post-renovation,laundry,disposal,'
       'garden,pest-control,caregivers' THEN
    RAISE EXCEPTION '0241_post_home_services_order: %', v_order;
  END IF;

  SELECT string_agg(id, ',' ORDER BY sort_order, id) INTO v_order
    FROM public.categories_l2 WHERE l1_id = 'cargo' AND is_active AND is_visible;
  IF v_order IS DISTINCT FROM 'movers,cargo-transport,courier-delivery,buy-deliver,food-delivery,'
       'tow-truck,driver-hourly' THEN
    RAISE EXCEPTION '0241_post_cargo_order: %', v_order;
  END IF;

  SELECT string_agg(id, ',' ORDER BY sort_order, id) INTO v_order
    FROM public.categories_l2 WHERE l1_id = 'repair-finishing' AND is_active AND is_visible;
  IF v_order IS DISTINCT FROM 'renovation,painting,wallpaper,tiling,floors,drywall,doors,windows' THEN
    RAISE EXCEPTION '0241_post_repair_finishing_order: %', v_order;
  END IF;

  SELECT string_agg(id, ',' ORDER BY sort_order, id) INTO v_order
    FROM public.categories_l2 WHERE l1_id = 'construction' AND is_active AND is_visible;
  IF split_part(v_order, ',', 1) <> 'general-construction' THEN
    RAISE EXCEPTION '0241_post_construction_order: %', v_order;
  END IF;

  IF (SELECT l1_id FROM public.categories_l2 WHERE id = 'appliance-repair') <> 'home-appliances'
     OR (SELECT count(*) FROM public.categories_l3 l3
           JOIN public.categories_l2 l2 ON l2.id = l3.l2_id
          WHERE l3.l2_id = 'appliance-repair' AND l2.l1_id = 'home-appliances') <> 12 THEN
    RAISE EXCEPTION '0241_post_appliance_repair';
  END IF;

  IF (SELECT string_agg(id, ',' ORDER BY sort_order, id) FROM public.categories_l3
       WHERE l2_id = 'intercom-alarm' AND is_active)
       IS DISTINCT FROM 'alarm-security,alarm-fire,access-control,intercom-pro'
     OR (SELECT string_agg(id, ',' ORDER BY sort_order, id) FROM public.categories_l3
          WHERE l2_id = 'security-systems' AND is_active)
       IS DISTINCT FROM 'cctv-install-pro,cctv-cloud' THEN
    RAISE EXCEPTION '0241_post_security_split';
  END IF;

  -- У каждой видимой активной подкатегории есть услуги и синонимы.
  IF EXISTS (SELECT 1 FROM public.categories_l2 c
              WHERE c.is_active AND c.is_visible
                AND (NOT EXISTS (SELECT 1 FROM public.categories_l3 s WHERE s.l2_id = c.id AND s.is_active)
                     OR (c.id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')
                         AND NOT EXISTS (SELECT 1 FROM public.category_terms t WHERE t.l2_id = c.id)))) THEN
    RAISE EXCEPTION '0241_post_l2_without_services_or_terms';
  END IF;

  -- Каждая видимая подкатегория — в активном разделе (иначе её не покажет
  -- встроенный каталог).
  IF EXISTS (SELECT 1 FROM public.categories_l2 c
               JOIN public.categories_l1 l1 ON l1.id = c.l1_id
              WHERE c.is_active AND c.is_visible AND NOT l1.is_active) THEN
    RAISE EXCEPTION '0241_post_visible_l2_in_inactive_l1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.category_terms WHERE l2_id = 'tow-truck' AND term = 'эвакуатор')
     OR NOT EXISTS (SELECT 1 FROM public.category_terms WHERE l2_id = 'car-repair' AND term = 'автосервис')
     OR NOT EXISTS (SELECT 1 FROM public.category_terms WHERE l2_id = 'pc-repair' AND term = 'ремонт телефона')
     OR EXISTS (SELECT 1 FROM public.category_terms
                 WHERE l2_id = 'locks-security' AND term IN ('видеонаблюдение', 'сигнализация')) THEN
    RAISE EXCEPTION '0241_post_terms';
  END IF;
END $$;

COMMIT;
