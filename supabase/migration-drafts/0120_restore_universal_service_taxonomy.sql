-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- 0120_restore_universal_service_taxonomy.sql
--
-- Forward-only draft for the universal order board. It restores the eight L1
-- branches removed by 0068 using stable identifiers from
-- supabase/seed/categories.sql. Existing rows are never overwritten: a
-- conflicting identifier is detected by the assertions below and rolls the
-- transaction back.
--
-- This file is intentionally data-only apart from additive category flags. It
-- does not change RLS/policies: production application remains gated by a live
-- read-only schema/policy export and backup.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.categories_l1') IS NULL
     OR to_regclass('public.categories_l2') IS NULL
     OR to_regclass('public.categories_l3') IS NULL THEN
    RAISE EXCEPTION 'universal_taxonomy_schema_missing'
      USING ERRCODE = 'P0001';
  END IF;
END
$guard$;

ALTER TABLE public.categories_l1
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_creation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catalog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matching_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_verification boolean NOT NULL DEFAULT false;

ALTER TABLE public.categories_l2
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_creation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catalog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matching_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_verification boolean NOT NULL DEFAULT false;

ALTER TABLE public.categories_l3
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_creation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catalog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matching_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_verification boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.categories_l1.is_internal IS
  'Internal taxonomy nodes are excluded from user-visible L1 counts and navigation.';
COMMENT ON COLUMN public.categories_l2.task_creation_enabled IS
  'Independent rollout gate for publishing orders in this L2.';
COMMENT ON COLUMN public.categories_l2.catalog_enabled IS
  'Independent rollout gate for showing provider catalogue entries in this L2.';
COMMENT ON COLUMN public.categories_l2.matching_enabled IS
  'Independent rollout gate for delivering an order to matching providers in this L2.';
COMMENT ON COLUMN public.categories_l2.requires_verification IS
  'Category-level provider verification requirement; enforcement needs a separately audited RLS/RPC migration.';

-- ON CONFLICT DO NOTHING must not silently accept an unrelated row that reused
-- a stable ID. Temporary guards validate every canonical tuple before the
-- conflict handler runs; they are removed again before the transaction ends.
CREATE FUNCTION public.guard_universal_l1_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing public.categories_l1%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.categories_l1 WHERE id = NEW.id;
  IF FOUND AND v_existing.name_ru IS DISTINCT FROM NEW.name_ru THEN
    RAISE EXCEPTION 'universal_taxonomy_l1_conflict_%', NEW.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.guard_universal_l2_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing public.categories_l2%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.categories_l2 WHERE id = NEW.id;
  IF FOUND AND (
    v_existing.l1_id IS DISTINCT FROM NEW.l1_id
    OR v_existing.name_ru IS DISTINCT FROM NEW.name_ru
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_l2_conflict_%', NEW.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.guard_universal_l3_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing public.categories_l3%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.categories_l3 WHERE id = NEW.id;
  IF FOUND AND (
    v_existing.l2_id IS DISTINCT FROM NEW.l2_id
    OR v_existing.name_ru IS DISTINCT FROM NEW.name_ru
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_l3_conflict_%', NEW.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER categories_l1_guard_universal_conflict
BEFORE INSERT ON public.categories_l1
FOR EACH ROW EXECUTE FUNCTION public.guard_universal_l1_conflict();

CREATE TRIGGER categories_l2_guard_universal_conflict
BEFORE INSERT ON public.categories_l2
FOR EACH ROW EXECUTE FUNCTION public.guard_universal_l2_conflict();

CREATE TRIGGER categories_l3_guard_universal_conflict
BEFORE INSERT ON public.categories_l3
FOR EACH ROW EXECUTE FUNCTION public.guard_universal_l3_conflict();

INSERT INTO public.categories_l1 (id, name_ru, icon, sort_order) VALUES
  ('auto',               'Авто и техника',          'Car',           3),
  ('transport',          'Перевозки и спецтехника', 'Truck',         4),
  ('beauty-health',      'Бьюти и здоровье',        'Scissors',      5),
  ('education',          'Образование',             'GraduationCap', 6),
  ('events',             'События и торжества',     'PartyPopper',   7),
  ('business',           'Бизнес и финансы',        'Briefcase',     8),
  ('it-digital',         'IT и цифровое',           'Monitor',       9),
  ('personal-services',  'Личный сервис',           'Heart',        10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories_l2
  (id, l1_id, name_ru, icon, sort_order, is_visible, is_active)
VALUES
  ('auto-service', 'auto', 'СТО общее',                  'Wrench',     1, true, true),
  ('tire-service', 'auto', 'Шиномонтаж',                 'Disc',       2, true, true),
  ('body-paint',   'auto', 'Кузовные и малярные работы', 'Paintbrush', 3, true, true),
  ('car-wash',     'auto', 'Мойка и детейлинг',          'Droplets',   4, true, true),
  ('roadside',     'auto', 'Выездная техпомощь',         'LifeBuoy',   5, true, true),
  ('cargo',           'transport', 'Грузоперевозки',           'Truck',   1, true,  true),
  ('heavy-equipment', 'transport', 'Спецтехника',              'Truck',   2, true,  true),
  ('towing',          'transport', 'Эвакуатор и буксировка',   'Truck',   3, false, true),
  ('delivery',        'transport', 'Курьеры и доставка',       'Package', 4, false, true),
  ('nails',        'beauty-health', 'Маникюр и педикюр',     'Hand',        1, true, true),
  ('lashes-brows', 'beauty-health', 'Брови и ресницы',       'Eye',         2, true, true),
  ('hair',         'beauty-health', 'Парикмахер',            'Scissors',    3, true, true),
  ('cosmetology',  'beauty-health', 'Косметология',          'Sparkles',    4, true, true),
  ('massage',      'beauty-health', 'Массаж',                'Hand',        5, true, true),
  ('stylist',      'beauty-health', 'Стилист / визажист',    'Palette',     6, true, true),
  ('home-medical', 'beauty-health', 'Медицина на дому',      'Stethoscope', 7, true, true),
  ('school-subjects',      'education', 'Школьные предметы',         'BookOpen',      1, true,  true),
  ('exam-prep',            'education', 'Подготовка к экзаменам',    'GraduationCap', 2, true,  true),
  ('languages',            'education', 'Языки',                     'Languages',     3, true,  true),
  ('religious-education',  'education', 'Религиозное образование',   'BookOpen',      4, true,  true),
  ('extra-education',      'education', 'Дополнительное образование','Sparkles',      5, false, true),
  ('sports-coach',         'education', 'Спорт и фитнес',            'Dumbbell',      6, false, true),
  ('catering',      'events', 'Кейтеринг и кухня',     'Utensils', 1, true,  true),
  ('confectionery', 'events', 'Кондитеры и торты',     'Cake',     2, false, true),
  ('entertainment', 'events', 'Ведущие, музыканты',    'Mic',      3, false, true),
  ('decor',         'events', 'Декор и оформление',    'Sparkles', 4, false, true),
  ('photo-video',   'events', 'Фото и видео',          'Camera',   5, false, true),
  ('rentals',       'events', 'Прокат и аренда',       'Package',  6, false, true),
  ('legal',       'business', 'Юридические услуги',    'Scale',      1, false, true),
  ('accounting',  'business', 'Бухгалтерия и налоги',  'Calculator', 2, false, true),
  ('translation', 'business', 'Переводы и нотариус',   'Languages',  3, false, true),
  ('hr',          'business', 'HR и рекрутинг',        'Users',      4, false, true),
  ('insurance',   'business', 'Страхование',           'Shield',     5, false, true),
  ('computer-help', 'it-digital', 'Компьютерная помощь', 'Laptop',    1, false, true),
  ('dev-sites',     'it-digital', 'Разработка и сайты',  'Code',      2, false, true),
  ('marketing',     'it-digital', 'SMM и реклама',       'Megaphone', 3, false, true),
  ('design',        'it-digital', 'Дизайн',              'Palette',   4, false, true),
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
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories_l3
  (id, l2_id, name_ru, icon, avg_check_rub, urgency_typical, seasonality, requires_license, sort_order)
VALUES
  ('oil-change',     'auto-service', 'Замена масла / фильтров',  'Droplet', 2000, 'week',   'year_round', false, 1),
  ('diagnostics',    'auto-service', 'Компьютерная диагностика', 'Cpu',     1500, 'urgent', 'year_round', false, 2),
  ('brakes',         'auto-service', 'Тормоза (колодки, диски)', 'Disc',    4500, 'urgent', 'year_round', false, 3),
  ('suspension',     'auto-service', 'Подвеска (стойки, рычаги)','Wrench',  8000, 'week',   'year_round', false, 4),
  ('engine-repair',  'auto-service', 'Ремонт двигателя',         'Cog',    35000, 'week',   'year_round', false, 5),
  ('gearbox',        'auto-service', 'Ремонт коробки передач',   'Cog',    25000, 'week',   'year_round', false, 6),
  ('tire-change',   'tire-service', 'Сезонная переобувка', 'Disc', 2000, 'urgent', 'year_round', false, 1),
  ('tire-repair',   'tire-service', 'Ремонт прокола',      'Disc',  500, 'urgent', 'year_round', false, 2),
  ('tire-balance',  'tire-service', 'Балансировка',        'Disc', 1000, 'week',   'year_round', false, 3),
  ('body-repair',        'body-paint', 'Кузовной ремонт после ДТП',  'Car',       25000, 'week', 'year_round', false, 1),
  ('painting-car',       'body-paint', 'Покраска автомобиля',        'Paintbrush',80000, 'month','year_round', false, 2),
  ('polish',             'body-paint', 'Полировка кузова',           'Sparkles',   4500, 'week', 'year_round', false, 3),
  ('dent-repair',        'body-paint', 'Удаление вмятин без покраски','Car',       3500, 'week', 'year_round', false, 4),
  ('windshield-replace', 'body-paint', 'Замена лобового стекла',     'Square',     8000, 'week', 'year_round', false, 5),
  ('car-wash-complex',  'car-wash', 'Комплекс мойка',     'Droplets', 800, 'urgent', 'year_round', false, 1),
  ('interior-cleaning', 'car-wash', 'Химчистка салона',   'Sparkles',4500, 'week',   'year_round', false, 2),
  ('mobile-wash',       'car-wash', 'Выездная мойка',     'Truck',   1500, 'urgent', 'year_round', false, 3),
  ('jumpstart',           'roadside', 'Прикурить аккумулятор / запуск', 'Battery', 800,  'urgent', 'year_round', false, 1),
  ('mobile-diagnostics',  'roadside', 'Выездная диагностика',           'Cpu',     2500, 'urgent', 'year_round', false, 2),
  ('gazelle',         'cargo', 'Газель (1.5-3 т)',                 'Truck',  800, 'urgent', 'year_round', false, 1),
  ('cargo-large',     'cargo', 'Фура / 5+ тонн',                   'Truck', 2500, 'week',   'year_round', false, 2),
  ('movers',          'cargo', 'Грузчики',                         'Users',  500, 'urgent', 'year_round', false, 3),
  ('apartment-move',  'cargo', 'Квартирный переезд под ключ',      'PackageOpen', 8000, 'week', 'year_round', false, 4),
  ('intercity',       'cargo', 'Межгород (Магас–Назрань и далее)', 'Truck',   25, 'week',   'year_round', false, 5),
  ('manipulator', 'heavy-equipment', 'Манипулятор',     'Truck',  2500, 'week', 'year_round', false, 1),
  ('excavator',   'heavy-equipment', 'Экскаватор',      'Wrench', 2500, 'week', 'year_round', false, 2),
  ('crane',       'heavy-equipment', 'Автокран',        'Truck',  3500, 'week', 'year_round', false, 3),
  ('bulldozer',   'heavy-equipment', 'Бульдозер / трактор','Truck',2000,'week', 'year_round', false, 4),
  ('dumper',      'heavy-equipment', 'Самосвал',        'Truck',  1500, 'week', 'year_round', false, 5),
  ('tow-light',   'towing', 'Эвакуатор легковой', 'Truck', 2500, 'urgent', 'year_round', false, 1),
  ('tow-truck',   'towing', 'Эвакуатор грузовой', 'Truck', 6000, 'urgent', 'year_round', false, 2),
  ('mobile-fuel', 'towing', 'Подвоз топлива',     'Fuel',  1500, 'urgent', 'year_round', false, 3),
  ('courier-city',  'delivery', 'Курьер по городу',          'Package',     400, 'urgent', 'year_round', false, 1),
  ('delivery-food', 'delivery', 'Доставка еды / продуктов',  'ShoppingBag', 300, 'urgent', 'year_round', false, 2),
  ('manicure-classic', 'nails', 'Классический маникюр',     'Hand',        800, 'week', 'year_round', false, 1),
  ('manicure-gel',     'nails', 'Маникюр с гель-лаком',     'Hand',       1500, 'week', 'year_round', false, 2),
  ('pedicure',         'nails', 'Педикюр',                  'Footprints', 1800, 'week', 'year_round', false, 3),
  ('nails-extension',  'nails', 'Наращивание ногтей',       'Hand',       2500, 'week', 'year_round', false, 4),
  ('manicure-mobile',  'nails', 'Маникюр на дому',          'Hand',       1800, 'week', 'year_round', false, 5),
  ('lashes-classic',  'lashes-brows', 'Наращивание ресниц',          'Eye', 1800, 'week', 'year_round', false, 1),
  ('lashes-volume',   'lashes-brows', 'Объёмное наращивание',        'Eye', 2800, 'week', 'year_round', false, 2),
  ('brows-shaping',   'lashes-brows', 'Коррекция бровей',            'Eye',  600, 'week', 'year_round', false, 3),
  ('brows-tint',      'lashes-brows', 'Окрашивание бровей',          'Eye',  800, 'week', 'year_round', false, 4),
  ('brows-laminate',  'lashes-brows', 'Ламинирование бровей',        'Eye', 1500, 'week', 'year_round', false, 5),
  ('lashes-laminate', 'lashes-brows', 'Ламинирование ресниц',        'Eye', 2000, 'week', 'year_round', false, 6),
  ('haircut-women', 'hair', 'Женская стрижка',         'Scissors', 1200, 'week', 'year_round', false, 1),
  ('haircut-men',   'hair', 'Мужская стрижка',         'Scissors',  700, 'week', 'year_round', false, 2),
  ('haircut-kids',  'hair', 'Детская стрижка',         'Scissors',  500, 'week', 'year_round', false, 3),
  ('hair-color',    'hair', 'Окрашивание',             'Palette',  3500, 'week', 'year_round', false, 4),
  ('hair-styling',  'hair', 'Укладка / причёска',      'Sparkles', 3000, 'week', 'wedding_season', false, 5),
  ('hair-keratin',  'hair', 'Кератиновое выпрямление', 'Sparkles', 6000, 'week', 'year_round', false, 6),
  ('facial-cleaning', 'cosmetology', 'Чистка лица',                          'User',     2500, 'week', 'year_round', false, 1),
  ('peeling',         'cosmetology', 'Пилинг',                               'Sparkles', 3500, 'week', 'year_round', false, 2),
  ('injections',      'cosmetology', 'Уколы красоты (только с лицензией)',   'Syringe',  6000, 'week', 'year_round', true,  3),
  ('massage-classic',  'massage', 'Классический массаж', 'Hand',        1800, 'week', 'year_round', false, 1),
  ('massage-therapy',  'massage', 'Лечебный массаж',     'Stethoscope', 2500, 'week', 'year_round', false, 2),
  ('massage-children', 'massage', 'Детский массаж',      'Baby',        1500, 'week', 'year_round', false, 3),
  ('makeup-day',     'stylist', 'Дневной макияж',         'Palette', 2500, 'week', 'year_round',      false, 1),
  ('makeup-wedding', 'stylist', 'Свадебный макияж',       'Palette', 6000, 'week', 'wedding_season',  false, 2),
  ('stylist-consult','stylist', 'Шопер / стилист по гардеробу','Shirt',3500,'week','year_round',     false, 3),
  ('injections-home','home-medical', 'Уколы / капельницы (медсестра)', 'Syringe',     500, 'urgent', 'year_round', true,  1),
  ('rehab',          'home-medical', 'Реабилитация после травмы',      'Stethoscope',2500, 'week',   'year_round', false, 2),
  ('wound-care',     'home-medical', 'Перевязки, уход за раной',       'Bandage',     800, 'urgent', 'year_round', false, 3),
  ('math-school',        'school-subjects', 'Математика (1-11 кл.)',     'Calculator',   700, 'week', 'year_round', false, 1),
  ('russian-school',     'school-subjects', 'Русский язык',              'BookOpen',     700, 'week', 'year_round', false, 2),
  ('physics-school',     'school-subjects', 'Физика',                    'Atom',         800, 'week', 'year_round', false, 3),
  ('chemistry-school',   'school-subjects', 'Химия',                     'FlaskConical', 800, 'week', 'year_round', false, 4),
  ('biology-school',     'school-subjects', 'Биология',                  'Sprout',       700, 'week', 'year_round', false, 5),
  ('history-school',     'school-subjects', 'История / Обществознание',  'BookOpen',     700, 'week', 'year_round', false, 6),
  ('informatics-school', 'school-subjects', 'Информатика',               'Code',         800, 'week', 'year_round', false, 7),
  ('ege-prep',        'exam-prep', 'ЕГЭ',               'GraduationCap',  1200, 'month', 'year_round', false, 1),
  ('oge-prep',        'exam-prep', 'ОГЭ',               'GraduationCap',   900, 'month', 'year_round', false, 2),
  ('vpr-prep',        'exam-prep', 'ВПР',               'GraduationCap',   700, 'week',  'year_round', false, 3),
  ('university-entry','exam-prep', 'Поступление в ВУЗ', 'GraduationCap', 25000, 'month', 'year_round', false, 4),
  ('english',          'languages', 'Английский',                 'Languages', 1000, 'week', 'year_round', false, 1),
  ('arabic',           'languages', 'Арабский',                   'Languages', 1200, 'week', 'year_round', false, 2),
  ('ingush',           'languages', 'Ингушский',                  'Languages',  600, 'week', 'year_round', false, 3),
  ('chechen',          'languages', 'Чеченский',                  'Languages',  600, 'week', 'year_round', false, 4),
  ('russian-foreign',  'languages', 'Русский как иностранный',    'Languages', 1000, 'week', 'year_round', false, 5),
  ('turkish',          'languages', 'Турецкий',                   'Languages', 1200, 'week', 'year_round', false, 6),
  ('quran-reading',      'religious-education', 'Чтение Корана',                'BookOpen',  800, 'week', 'year_round', false, 1),
  ('quran-memorization', 'religious-education', 'Заучивание сур (Хифз)',        'BookOpen', 1000, 'week', 'year_round', false, 2),
  ('islamic-basics',     'religious-education', 'Основы исламского вероучения', 'BookOpen',  700, 'week', 'year_round', false, 3),
  ('chess',              'extra-education', 'Шахматы',                    'Crown',          800, 'week', 'year_round', false, 1),
  ('music-instruments',  'extra-education', 'Музыкальные инструменты',    'Music',         1000, 'week', 'year_round', false, 2),
  ('vocal',              'extra-education', 'Вокал / пение',              'Mic',           1200, 'week', 'year_round', false, 3),
  ('drawing',            'extra-education', 'Рисование',                  'Palette',        800, 'week', 'year_round', false, 4),
  ('programming-kids',   'extra-education', 'Программирование для детей', 'Code',          1500, 'week', 'year_round', false, 5),
  ('speech-therapy',     'extra-education', 'Логопед',                    'MessageCircle', 1200, 'week', 'year_round', false, 6),
  ('personal-trainer', 'sports-coach', 'Персональный тренер',     'Dumbbell', 1500, 'week', 'year_round', false, 1),
  ('yoga',             'sports-coach', 'Йога',                    'User',     1000, 'week', 'year_round', false, 2),
  ('boxing-coach',     'sports-coach', 'Бокс / единоборства',     'Dumbbell', 1500, 'week', 'year_round', false, 3),
  ('swimming',         'sports-coach', 'Плавание',                'Waves',    1500, 'week', 'year_round', false, 4),
  ('wedding-catering',  'catering', 'Свадебный стол',                'Utensils',  800, 'month',  'wedding_season', false, 1),
  ('funeral-catering',  'catering', 'Поминальный стол',              'Utensils',  500, 'urgent', 'year_round',     false, 2),
  ('banquet-cooking',   'catering', 'Повар на банкет',               'ChefHat', 12000, 'week',   'year_round',     false, 3),
  ('home-chef',         'catering', 'Повар на дом',                  'ChefHat',  3500, 'week',   'year_round',     false, 4),
  ('national-cuisine',  'catering', 'Национальная кухня',            'Utensils',  700, 'month',  'year_round',     false, 5),
  ('wedding-cake',  'confectionery', 'Свадебный торт',            'Cake', 3500, 'month', 'wedding_season', false, 1),
  ('birthday-cake', 'confectionery', 'Праздничный торт',          'Cake', 1800, 'week',  'year_round',     false, 2),
  ('desserts',      'confectionery', 'Капкейки / пироги / макаруны','Cookie',200,'week', 'year_round',     false, 3),
  ('host-russian',  'entertainment', 'Ведущий / тамада',           'Mic',  25000, 'month', 'wedding_season', false, 1),
  ('host-ingush',   'entertainment', 'Ведущий на ингушском',       'Mic',  20000, 'month', 'wedding_season', false, 2),
  ('singer',        'entertainment', 'Певец / певица',             'Music',15000, 'month', 'wedding_season', false, 3),
  ('accordion',     'entertainment', 'Гармонист',                  'Music',10000, 'month', 'wedding_season', false, 4),
  ('ensemble',      'entertainment', 'Ансамбль / группа',          'Music',40000, 'month', 'wedding_season', false, 5),
  ('dj',            'entertainment', 'DJ',                         'Disc3',15000, 'month', 'wedding_season', false, 6),
  ('animator',      'entertainment', 'Аниматор детский',           'Smile', 5000, 'week',  'year_round',     false, 7),
  ('arch-flowers',  'decor', 'Свадебная арка / цветы',  'Flower2', 25000, 'month', 'wedding_season', false, 1),
  ('balloons',      'decor', 'Шары / фотозоны',         'Sparkles', 8000, 'week',  'year_round',     false, 2),
  ('tables-decor',  'decor', 'Сервировка / президиум',  'Utensils',15000, 'month', 'wedding_season', false, 3),
  ('hall-decor',    'decor', 'Оформление зала',         'Sparkles',35000, 'month', 'wedding_season', false, 4),
  ('photo-wedding', 'photo-video', 'Свадебный фотограф',      'Camera', 25000, 'month', 'wedding_season', false, 1),
  ('video-wedding', 'photo-video', 'Свадебный видеограф',     'Video',  35000, 'month', 'wedding_season', false, 2),
  ('photo-event',   'photo-video', 'Репортажная фотосъёмка',  'Camera',  8000, 'week',  'year_round',     false, 3),
  ('studio-photo',  'photo-video', 'Студийная фотосессия',    'Camera',  4500, 'week',  'year_round',     false, 4),
  ('drone',         'photo-video', 'Аэросъёмка дрон',         'Plane',   8000, 'week',  'year_round',     false, 5),
  ('dress-rental',  'rentals', 'Прокат свадебного / вечернего платья', 'Shirt', 5000, 'week',  'wedding_season', false, 1),
  ('car-wedding',   'rentals', 'Свадебный кортеж / лимузин',           'Car',   8000, 'month', 'wedding_season', false, 2),
  ('tent-rental',   'rentals', 'Аренда шатра / мебели',                'Tent', 25000, 'month', 'wedding_season', false, 3),
  ('legal-consult',     'legal', 'Консультация юриста',                 'Scale',     1500, 'week',  'year_round', false, 1),
  ('contracts',         'legal', 'Составление договоров',               'FileText',  3500, 'week',  'year_round', false, 2),
  ('court-rep',         'legal', 'Представительство в суде',            'Scale',    15000, 'month', 'year_round', false, 3),
  ('real-estate-legal', 'legal', 'Сопровождение сделок с недвижимостью','Home',     12000, 'month', 'year_round', false, 4),
  ('self-employed-setup', 'accounting', 'Открытие самозанятости',  'UserCheck', 1500, 'urgent', 'year_round', false, 1),
  ('ip-registration',     'accounting', 'Регистрация ИП',          'FileText',  3500, 'week',   'year_round', false, 2),
  ('bookkeeping',         'accounting', 'Бухгалтерское обслуживание','Calculator',5000,'week',  'year_round', false, 3),
  ('tax-declaration',     'accounting', 'Декларация 3-НДФЛ',       'FileText',  2500, 'week',   'year_round', false, 4),
  ('translation-docs', 'translation', 'Перевод документов',                'FileText',  500, 'week', 'year_round', false, 1),
  ('notary-prep',      'translation', 'Помощь с нотариальными делами',     'FileText', 1500, 'week', 'year_round', false, 2),
  ('hiring',     'hr', 'Подбор персонала',         'Users', 8000, 'month', 'year_round', false, 1),
  ('hr-consult', 'hr', 'Консультация по кадрам',   'Users', 2500, 'week',  'year_round', false, 2),
  ('osago',              'insurance', 'Оформление ОСАГО',     'Car',          500, 'urgent', 'year_round', false, 1),
  ('kasko',              'insurance', 'КАСКО',                'Car',         1500, 'week',   'year_round', false, 2),
  ('property-insurance', 'insurance', 'Страхование жилья',    'Home',        1500, 'week',   'year_round', false, 3),
  ('health-insurance',   'insurance', 'ДМС',                  'Stethoscope', 1500, 'week',   'year_round', false, 4),
  ('windows-setup',  'computer-help', 'Установка Windows / macOS', 'Monitor',  1500, 'urgent', 'year_round', false, 1),
  ('virus-removal',  'computer-help', 'Удаление вирусов',           'Bug',     1500, 'urgent', 'year_round', false, 2),
  ('data-recovery',  'computer-help', 'Восстановление данных',      'Database',5000, 'urgent', 'year_round', false, 3),
  ('printer-setup',  'computer-help', 'Настройка принтера / сети',  'Printer', 1500, 'week',   'year_round', false, 4),
  ('pc-repair',      'computer-help', 'Ремонт компьютера / ноутбука','Laptop', 2500, 'week',   'year_round', false, 5),
  ('landing-page', 'dev-sites', 'Landing / сайт-визитка',           'Layout',      25000, 'month', 'year_round', false, 1),
  ('online-store', 'dev-sites', 'Интернет-магазин',                 'ShoppingCart',80000, 'month', 'year_round', false, 2),
  ('mobile-app',   'dev-sites', 'Мобильное приложение',             'Smartphone', 200000, 'month', 'year_round', false, 3),
  ('seo',          'dev-sites', 'SEO продвижение',                  'TrendingUp',  15000, 'month', 'year_round', false, 4),
  ('crm-setup',    'dev-sites', 'Настройка CRM / автоматизации',    'Cog',         25000, 'month', 'year_round', false, 5),
  ('smm',       'marketing', 'Ведение соцсетей',           'Instagram', 15000, 'month', 'year_round', false, 1),
  ('targeting', 'marketing', 'Таргетированная реклама',    'Target',    12000, 'week',  'year_round', false, 2),
  ('branding',  'marketing', 'Брендинг / логотип',         'Palette',   15000, 'month', 'year_round', false, 3),
  ('interior-design', 'design', 'Дизайн интерьера',              'Home',    60000, 'month', 'year_round', false, 1),
  ('graphic-design',  'design', 'Графический дизайн / полиграфия','Palette', 3500, 'week',  'year_round', false, 2),
  ('3d-vis',          'design', '3D-визуализация',               'Box',     25000, 'month', 'year_round', false, 3),
  ('nanny-hourly',   'childcare', 'Няня почасовая',     'Baby',  350, 'week',   'year_round', false, 1),
  ('nanny-fulltime', 'childcare', 'Няня постоянная',    'Baby',35000, 'month',  'year_round', false, 2),
  ('governess',      'childcare', 'Гувернантка',        'User',50000, 'month',  'year_round', false, 3),
  ('nanny-evening',  'childcare', 'Няня на вечер',      'Baby',  500, 'urgent', 'year_round', false, 4),
  ('caregiver-hourly',   'eldercare', 'Сиделка почасовая',      'Heart',   250, 'week',   'year_round', false, 1),
  ('caregiver-fulltime', 'eldercare', 'Сиделка с проживанием',  'Heart', 40000, 'month',  'year_round', false, 2),
  ('caregiver-hospital', 'eldercare', 'Сиделка в больнице',     'Heart',  1500, 'urgent', 'year_round', false, 3),
  ('psychologist',       'psychology', 'Психолог',          'Brain',  2500, 'week', 'year_round', false, 1),
  ('family-counseling',  'psychology', 'Семейный психолог', 'Heart',  3500, 'week', 'year_round', false, 2),
  ('child-psychologist', 'psychology', 'Детский психолог',  'Baby',   2500, 'week', 'year_round', false, 3),
  ('coach',              'psychology', 'Коуч',              'Target', 3500, 'week', 'year_round', false, 4),
  ('clothes-repair',    'sewing', 'Ремонт одежды',         'Shirt',     500, 'week',  'year_round', false, 1),
  ('clothes-tailoring', 'sewing', 'Подгонка по фигуре',    'Shirt',     800, 'week',  'year_round', false, 2),
  ('custom-sewing',     'sewing', 'Пошив на заказ',        'Scissors', 3500, 'month', 'year_round', false, 3),
  ('national-clothes',  'sewing', 'Национальная одежда',   'Shirt',    8000, 'month', 'wedding_season', false, 4),
  ('pet-grooming', 'pet-services', 'Груминг',         'PawPrint',    2500, 'week',   'year_round', false, 1),
  ('pet-walking',  'pet-services', 'Выгул собак',     'PawPrint',     300, 'urgent', 'year_round', false, 2),
  ('pet-sitting',  'pet-services', 'Передержка',      'PawPrint',     500, 'week',   'year_round', false, 3),
  ('vet-home',     'pet-services', 'Ветеринар на дом','Stethoscope', 1500, 'urgent', 'year_round', true,  4),
  ('mawlid-host',      'religious-services', 'Проведение мовлида',           'BookOpen', 5000, 'week',   'year_round', false, 1),
  ('imam-service',     'religious-services', 'Имам на дом',                  'BookOpen', 3500, 'urgent', 'year_round', false, 2),
  ('tahara',           'religious-services', 'Подготовка к погребению',      'BookOpen', NULL, 'urgent', 'year_round', false, 3),
  ('quran-recitation', 'religious-services', 'Чтение Корана на меджлисе',    'BookOpen', 3500, 'week',   'year_round', false, 4),
  ('office-cleaning', 'b2b-services', 'Клининг офисов',            'Sparkles', 8000, 'month', 'year_round', false, 1),
  ('office-it',       'b2b-services', 'IT-обслуживание организаций','Server', 15000, 'month', 'year_round', false, 2),
  ('astrology', 'alt-services', 'Астрология / нумерология', 'Sparkles', 2500, 'week', 'year_round', false, 1),
  ('other', 'other-personal', 'Прочее (с обязательным описанием)', 'MoreHorizontal', NULL, 'week', 'year_round', false, 1)
ON CONFLICT (id) DO NOTHING;

-- Internal fallback preserves orders.l2_id NOT NULL for free-form tasks. It is
-- deliberately inactive and feature-off until a separate controlled rollout
-- enables task creation after live prerequisites and classification staffing.
INSERT INTO public.categories_l1
  (id, name_ru, icon, sort_order, is_active, is_internal,
   task_creation_enabled, catalog_enabled, matching_enabled)
VALUES
  ('xtrud-internal', 'Системные категории', 'Shapes', 10000,
   false, true, false, false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories_l2
  (id, l1_id, name_ru, icon, sort_order, is_visible, is_active, is_internal,
   task_creation_enabled, catalog_enabled, matching_enabled)
VALUES
  ('other-services', 'xtrud-internal', 'Другая услуга',
   'Question', 1, false, false, true, false, false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories_l3
  (id, l2_id, name_ru, icon, sort_order, is_active, is_internal,
   task_creation_enabled, catalog_enabled, matching_enabled)
VALUES
  ('other-service', 'other-services', 'Услуга не определена',
   'Question', 1, false, true, false, false, false)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER categories_l1_guard_universal_conflict ON public.categories_l1;
DROP TRIGGER categories_l2_guard_universal_conflict ON public.categories_l2;
DROP TRIGGER categories_l3_guard_universal_conflict ON public.categories_l3;
DROP FUNCTION public.guard_universal_l1_conflict();
DROP FUNCTION public.guard_universal_l2_conflict();
DROP FUNCTION public.guard_universal_l3_conflict();

-- Adding rollout columns with false defaults keeps unknown or concurrently
-- introduced taxonomy nodes closed. Only the two pre-existing product branches
-- are restored to their proven current behaviour, and only by parent identity.
UPDATE public.categories_l1
SET task_creation_enabled = true,
    catalog_enabled = true,
    matching_enabled = true
WHERE id IN ('construction', 'home-services');

UPDATE public.categories_l2
SET task_creation_enabled = true,
    catalog_enabled = true,
    matching_enabled = true
WHERE l1_id IN ('construction', 'home-services')
  AND is_active;

UPDATE public.categories_l3 AS l3
SET task_creation_enabled = true,
    catalog_enabled = true,
    matching_enabled = true
FROM public.categories_l2 AS l2
WHERE l2.id = l3.l2_id
  AND l2.l1_id IN ('construction', 'home-services')
  AND l2.is_active
  AND l3.is_active;

UPDATE public.categories_l1
SET is_active = false,
    task_creation_enabled = false,
    catalog_enabled = false,
    matching_enabled = false,
    requires_verification = false
WHERE id IN ('auto', 'transport', 'beauty-health', 'education', 'events', 'business', 'it-digital', 'personal-services');

UPDATE public.categories_l2
SET is_visible = false,
    is_active = false,
    task_creation_enabled = false,
    catalog_enabled = false,
    matching_enabled = false,
    requires_verification = false
WHERE id IN ('auto-service', 'tire-service', 'body-paint', 'car-wash', 'roadside', 'cargo', 'heavy-equipment', 'towing', 'delivery', 'nails', 'lashes-brows', 'hair', 'cosmetology', 'massage', 'stylist', 'home-medical', 'school-subjects', 'exam-prep', 'languages', 'religious-education', 'extra-education', 'sports-coach', 'catering', 'confectionery', 'entertainment', 'decor', 'photo-video', 'rentals', 'legal', 'accounting', 'translation', 'hr', 'insurance', 'computer-help', 'dev-sites', 'marketing', 'design', 'childcare', 'eldercare', 'psychology', 'sewing', 'pet-services', 'religious-services', 'b2b-services', 'alt-services', 'wedding-services-umbrella', 'other-personal');

UPDATE public.categories_l3
SET is_active = false,
    task_creation_enabled = false,
    catalog_enabled = false,
    matching_enabled = false,
    requires_verification = requires_license
WHERE l2_id IN ('auto-service', 'tire-service', 'body-paint', 'car-wash', 'roadside', 'cargo', 'heavy-equipment', 'towing', 'delivery', 'nails', 'lashes-brows', 'hair', 'cosmetology', 'massage', 'stylist', 'home-medical', 'school-subjects', 'exam-prep', 'languages', 'religious-education', 'extra-education', 'sports-coach', 'catering', 'confectionery', 'entertainment', 'decor', 'photo-video', 'rentals', 'legal', 'accounting', 'translation', 'hr', 'insurance', 'computer-help', 'dev-sites', 'marketing', 'design', 'childcare', 'eldercare', 'psychology', 'sewing', 'pet-services', 'religious-services', 'b2b-services', 'alt-services', 'wedding-services-umbrella', 'other-personal');

DO $assertions$
DECLARE
  v_user_l1_count integer;
BEGIN
  SELECT count(*) INTO v_user_l1_count
  FROM public.categories_l1
  WHERE is_internal = false
    AND id IN (
      'construction', 'home-services', 'auto', 'transport',
      'beauty-health', 'education', 'events', 'business',
      'it-digital', 'personal-services'
    );

  IF v_user_l1_count <> 10 THEN
    RAISE EXCEPTION 'universal_taxonomy_expected_10_user_l1_got_%', v_user_l1_count
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.categories_l1
    WHERE id IN (
      'auto', 'transport', 'beauty-health', 'education',
      'events', 'business', 'it-digital', 'personal-services'
    )
      AND (task_creation_enabled OR catalog_enabled OR matching_enabled)
  ) OR EXISTS (
    SELECT 1
    FROM public.categories_l2
    WHERE l1_id IN (
      'auto', 'transport', 'beauty-health', 'education',
      'events', 'business', 'it-digital', 'personal-services'
    )
      AND (task_creation_enabled OR catalog_enabled OR matching_enabled)
  ) OR EXISTS (
    SELECT 1
    FROM public.categories_l3 AS l3
    JOIN public.categories_l2 AS l2 ON l2.id = l3.l2_id
    WHERE l2.l1_id IN (
      'auto', 'transport', 'beauty-health', 'education',
      'events', 'business', 'it-digital', 'personal-services'
    )
      AND (l3.task_creation_enabled OR l3.catalog_enabled OR l3.matching_enabled)
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_restore_must_remain_feature_off'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.categories_l1
    WHERE id IN (
      'auto', 'transport', 'beauty-health', 'education',
      'events', 'business', 'it-digital', 'personal-services'
    )
      AND is_active
  ) OR EXISTS (
    SELECT 1
    FROM public.categories_l2
    WHERE l1_id IN (
      'auto', 'transport', 'beauty-health', 'education',
      'events', 'business', 'it-digital', 'personal-services'
    )
      AND (is_active OR is_visible)
  ) OR EXISTS (
    SELECT 1
    FROM public.categories_l3 AS l3
    JOIN public.categories_l2 AS l2 ON l2.id = l3.l2_id
    WHERE l2.l1_id IN (
      'auto', 'transport', 'beauty-health', 'education',
      'events', 'business', 'it-digital', 'personal-services'
    )
      AND l3.is_active
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_restore_legacy_visibility_must_remain_off'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.categories_l1
    WHERE id IN ('construction', 'home-services')
      AND NOT (task_creation_enabled AND catalog_enabled AND matching_enabled)
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_current_scope_flags_changed'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories_l2
    WHERE id = 'heavy-equipment' AND l1_id = 'transport'
      AND name_ru = 'Спецтехника'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.categories_l3
    WHERE id = 'bulldozer' AND l2_id = 'heavy-equipment'
      AND name_ru = 'Бульдозер / трактор'
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_heavy_equipment_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories_l2
    WHERE id = 'legal' AND l1_id = 'business'
      AND name_ru = 'Юридические услуги'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.categories_l3
    WHERE id = 'legal-consult' AND l2_id = 'legal'
      AND name_ru = 'Консультация юриста'
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_legal_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.categories_l1 l1
    JOIN public.categories_l2 l2 ON l2.l1_id = l1.id
    JOIN public.categories_l3 l3 ON l3.l2_id = l2.id
    WHERE l1.id = 'xtrud-internal'
      AND l2.id = 'other-services'
      AND l3.id = 'other-service'
      AND l1.is_internal AND l2.is_internal AND l3.is_internal
      AND NOT l1.is_active AND NOT l2.is_active AND NOT l3.is_active
      AND NOT l1.task_creation_enabled
      AND NOT l1.catalog_enabled
      AND NOT l1.matching_enabled
      AND NOT l2.task_creation_enabled
      AND NOT l2.catalog_enabled
      AND NOT l2.matching_enabled
      AND NOT l3.task_creation_enabled
      AND NOT l3.catalog_enabled
      AND NOT l3.matching_enabled
  ) THEN
    RAISE EXCEPTION 'universal_taxonomy_internal_fallback_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
END
$assertions$;

COMMIT;
