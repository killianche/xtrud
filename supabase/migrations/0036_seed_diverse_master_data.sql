-- 0036_seed_diverse_master_data.sql
-- Sprint J — разнообразие тестовых данных мастеров.
--
-- Запрос пользователя: «Половину мастеров сделай чтобы у них были несколько
-- категорий, некоторые мастера с бригадой или компания. Все имеющиеся в
-- backend поля и возможности используй».
--
-- Что делает:
--   1. 5 мастеров → account_type='brigade' с team_size 2-5
--   2. 3 мастера → account_type='company' с legal_name/inn/ogrn/tax_status
--   3. У 10 мастеров — добавляем 2-ю категорию (мульти-кат сценарий)
--   4. Заполняем has_tools / has_transport / languages для разнообразия
--   5. work_schedule минимум — по умолчанию пустой jsonb {}
--
-- Идемпотентность: ON CONFLICT DO NOTHING для master_categories (есть UNIQUE
-- на master_id+l2_id). UPDATE master_profiles — повторное выполнение
-- безопасно (одни и те же значения).

-- ============================================================================
-- 1. BRIGADE accounts (5 мастеров)
-- ============================================================================

UPDATE public.master_profiles SET account_type='brigade', team_size=3
  WHERE user_id='f0000021-0000-0000-0000-000000000001'; -- Иса Барахоев (Сантехник, 12 лет)
UPDATE public.master_profiles SET account_type='brigade', team_size=5
  WHERE user_id='f0000021-0000-0000-0000-000000000005'; -- Хамзат Цечоев (Общестрой, 15 лет)
UPDATE public.master_profiles SET account_type='brigade', team_size=2
  WHERE user_id='f0000021-0000-0000-0000-000000000006'; -- Бекхан Куштов (Электрик, 9 лет)
UPDATE public.master_profiles SET account_type='brigade', team_size=3
  WHERE user_id='f0000021-0000-0000-0000-000000000011'; -- Тимур Озиев (Отделочные, 11 лет)
UPDATE public.master_profiles SET account_type='brigade', team_size=4
  WHERE user_id='f0000021-0000-0000-0000-000000000018'; -- Ислам Точиев (14 лет)

-- ============================================================================
-- 2. COMPANY accounts с реквизитами (3 мастера)
-- ============================================================================

UPDATE public.master_profiles
  SET account_type='company', team_size=4,
      legal_name='ИП Картоев Д.Б.', inn='060123456789',
      tax_status='individual_entrepreneur'
  WHERE user_id='f0000021-0000-0000-0000-000000000013'; -- Дауд Картоев (10 лет)

UPDATE public.master_profiles
  SET account_type='company', team_size=6,
      legal_name='ООО «СтройКом»', inn='0601234567', ogrn='1230600123456',
      tax_status='legal_entity'
  WHERE user_id='f0000021-0000-0000-0000-000000000014'; -- Магомед Евлоев (8 лет)

UPDATE public.master_profiles
  SET account_type='company', team_size=3,
      legal_name='ИП Балкоева Л.А.', inn='060987654321',
      tax_status='individual_entrepreneur'
  WHERE user_id='f0000021-0000-0000-0000-000000000017'; -- Лиза Балкоева (4 года)

-- ============================================================================
-- 3. Вторые категории для 10 мастеров (мульти-кат)
--    INSERT ... ON CONFLICT (master_id, l2_id) DO NOTHING
-- ============================================================================

INSERT INTO public.master_categories (master_id, l2_id, l3_ids, category_bio, pricing_mode, category_radius_km)
VALUES
  -- 01 Иса Барахоев (был Сантехник) → +Сварка
  ('f0000021-0000-0000-0000-000000000001', 'welding', ARRAY[]::text[],
   'Сварочные работы — стальные конструкции, ограждения, отопление.',
   'per_hour'::master_pricing_mode, 25),

  -- 02 Руслан Гадиев (был Электрик) → +Малые работы по дому
  ('f0000021-0000-0000-0000-000000000002', 'handyman', ARRAY[]::text[],
   'Мастер на час: повесить полку, собрать мебель, починить мелочь.',
   'per_hour'::master_pricing_mode, 15),

  -- 05 Хамзат Цечоев (Общестрой) → +Отделочные работы
  ('f0000021-0000-0000-0000-000000000005', 'finishing', ARRAY[]::text[],
   'Отделка под ключ: штукатурка, шпаклёвка, покраска, плитка, ламинат.',
   'on_quote'::master_pricing_mode, 30),

  -- 06 Бекхан Куштов (Электрик) → +Климат
  ('f0000021-0000-0000-0000-000000000006', 'climate', ARRAY[]::text[],
   'Установка и обслуживание кондиционеров, монтаж сплит-систем.',
   'per_unit'::master_pricing_mode, 20),

  -- 08 Иса Мурзабеков (был Сантехник) → +Отделочные работы
  ('f0000021-0000-0000-0000-000000000008', 'finishing', ARRAY[]::text[],
   'Плитка, гипсокартон, потолки, мелкая отделка ванных комнат.',
   'per_unit'::master_pricing_mode, 20),

  -- 11 Тимур Озиев (Отделочные) → +Окна-двери
  ('f0000021-0000-0000-0000-000000000011', 'windows-doors', ARRAY[]::text[],
   'Установка межкомнатных и входных дверей, монтаж окон ПВХ.',
   'per_unit'::master_pricing_mode, 25),

  -- 12 Микаил Хамхоев (Сантехник) → +Электрика
  ('f0000021-0000-0000-0000-000000000012', 'electrical', ARRAY[]::text[],
   'Электромонтаж, разводка, замена щитков. Допуск до 1000 В.',
   'negotiable'::master_pricing_mode, 25),

  -- 13 Дауд Картоев (Общестрой, теперь company) → +Отделочные работы
  ('f0000021-0000-0000-0000-000000000013', 'finishing', ARRAY[]::text[],
   'Отделка под ключ от бригады ИП Картоев — гипсокартон, штукатурка, обои.',
   'on_quote'::master_pricing_mode, 50),

  -- 14 Магомед Евлоев (Отделочные, теперь ООО) → +Электрика
  ('f0000021-0000-0000-0000-000000000014', 'electrical', ARRAY[]::text[],
   'Электромонтажные работы силами ООО «СтройКом» — с договором и гарантией.',
   'on_quote'::master_pricing_mode, 60),

  -- 15 Бислан Ужахов (Окна-двери) → +Общестрой
  ('f0000021-0000-0000-0000-000000000015', 'general-construction', ARRAY[]::text[],
   'Общестроительные работы — кладка, фундамент, перегородки.',
   'on_quote'::master_pricing_mode, 30)
ON CONFLICT (master_id, l2_id) DO NOTHING;

-- ============================================================================
-- 4. has_tools / has_transport / languages — для разнообразия
-- ============================================================================

-- Все с инструментом по умолчанию (это базовая ожидание для мастера-ремонтника).
UPDATE public.master_profiles SET has_tools = true;

-- Транспорт — только у части (у бригад и компаний всегда, у других — random).
UPDATE public.master_profiles SET has_transport = true
  WHERE account_type IN ('brigade', 'company');
UPDATE public.master_profiles SET has_transport = false
  WHERE account_type = 'solo' AND user_id::text ~ '[02468]$'; -- чётный последний символ id

-- Языки — ru обязательно, ing у части (для разнообразия).
UPDATE public.master_profiles SET languages = ARRAY['ru', 'ing']
  WHERE user_id::text ~ '[1357]$';
UPDATE public.master_profiles SET languages = ARRAY['ru']
  WHERE NOT (user_id::text ~ '[1357]$');
