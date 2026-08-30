-- ============================================================================
-- Migration 0054 — Личный demo-мастер для пользователя.
--
-- Аккаунт: Руслан Хамхоев (+7 900 000-00-03), Магас, Центральный.
-- Полная конфигурация production-ready мастера: ⭐⭐⭐ верификация (самозанятый
-- с ИНН), 12 лет опыта, 3 категории (сантехника + электрика + отделка),
-- 8 услуг в прайсе, 8 фото в портфолио, 5 заказов в работе/завершённых +
-- 2 отклика на чужие открытые заказы + 4 отзыва от клиентов.
--
-- Логин (как у других демо-аккаунтов):
--   email:    79000000003@xtrud-demo.local
--   password: xtrud
--   phone OTP: любой 6-значный код (на текущей версии заглушка)
--
-- Идемпотентен: DELETE auth.users перед INSERT каскадит всю связанную data.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Cleanup
-- ============================================================================

DELETE FROM auth.users WHERE phone = '+79000000003';

-- Также удаляем заказы которые этот мастер мог "забрать" (на случай если кто-то
-- другой с тем же id успел их подписать). Это конкретные id из этой миграции.
DELETE FROM public.orders WHERE id IN (
  'e0000003-0000-0000-0000-000000000001'::uuid,
  'e0000003-0000-0000-0000-000000000002'::uuid,
  'e0000003-0000-0000-0000-000000000003'::uuid,
  'e0000003-0000-0000-0000-000000000004'::uuid,
  'e0000003-0000-0000-0000-000000000005'::uuid
);

-- ============================================================================
-- 2. Auth: phone + email + bcrypt пароль (как у других демо)
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'f0000003-0000-0000-0000-000000000003',
  'authenticated', 'authenticated',
  '+79000000003', now() - interval '90 days',
  '79000000003@xtrud-demo.local', now() - interval '90 days',
  crypt('xtrud', gen_salt('bf')),
  '{"provider":"email","providers":["email","phone"]}'::jsonb,
  '{}'::jsonb,
  false, false, false,
  now() - interval '90 days', now(),
  '', '', ''
);

-- Identity для email (нужна Supabase для login через signInWithPassword)
INSERT INTO auth.identities (
  id, user_id, provider, provider_id, identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'f0000003-0000-0000-0000-000000000003',
  'email',
  'f0000003-0000-0000-0000-000000000003',
  jsonb_build_object(
    'sub', 'f0000003-0000-0000-0000-000000000003',
    'email', '79000000003@xtrud-demo.local',
    'email_verified', true,
    'phone_verified', true
  ),
  now(), now(), now()
);

-- ============================================================================
-- 3. Public.users — общий профиль (запись создана триггером на auth.users)
-- ============================================================================

UPDATE public.users SET
  first_name = 'Руслан',
  last_name = 'Хамхоев',
  avatar_url = 'https://api.dicebear.com/9.x/shapes/png?seed=test-master-ruslan-personal',
  city_id = 'magas',
  district = 'Центральный',
  is_master = true,
  is_client = true,
  active_role = 'master',
  onboarding_completed_at = now() - interval '90 days'
WHERE id = 'f0000003-0000-0000-0000-000000000003';

-- ============================================================================
-- 4. Master profile — полная конфигурация premium-мастера
-- ============================================================================

INSERT INTO public.master_profiles (
  user_id, bio, status, verification_level,
  experience_years, has_tools, has_transport, service_radius_km,
  team_size, languages,
  tax_status, inn,
  work_schedule, home_clients_policy,
  account_type,
  availability_status, availability_until
) VALUES (
  'f0000003-0000-0000-0000-000000000003',
  'Сертифицированный мастер с 12-летним опытом работы по республике. Специализируюсь на сантехнике, электрике и отделочных работах под ключ. Свой инструмент и транспорт. Работаю чисто, аккуратно, в срок. Гарантия на все виды работ — 1 год.',
  'active',
  3,                          -- ⭐⭐⭐ Статус: самозанятый с подтверждённым ИНН
  12,
  true, true,
  30,
  1,
  ARRAY['ru','in']::text[],
  'self_employed',
  '060800123456',             -- 12-значный ИНН для самозанятого
  jsonb_build_object(
    'mon', jsonb_build_array(9, 18),
    'tue', jsonb_build_array(9, 18),
    'wed', jsonb_build_array(9, 18),
    'thu', jsonb_build_array(9, 18),
    'fri', jsonb_build_array(9, 18),
    'sat', jsonb_build_array(10, 16),
    'sun', NULL
  ),
  'anytime',
  'solo',
  'this_week',                -- "Принимаю заказы на этой неделе"
  (date_trunc('week', now()) + interval '7 days' - interval '1 second')::timestamptz
);

-- ============================================================================
-- 5. Категории мастера (3) — Сантехника + Электрика + Отделочные работы
-- ============================================================================

INSERT INTO public.master_categories (
  master_id, l2_id, pricing_mode,
  category_bio, category_radius_km,
  closed_deals
) VALUES
  ('f0000003-0000-0000-0000-000000000003', 'plumbing', 'per_hour',
   'Полный спектр сантехнических работ: от замены смесителя до разводки в новостройке. Свой инструмент, гарантия 1 год.',
   30, 14),
  ('f0000003-0000-0000-0000-000000000003', 'electrical', 'per_hour',
   'Электромонтаж от точки до полной разводки. Сборка щитов, заземление, монтаж люстр. Допуск к 1000В.',
   30, 9),
  ('f0000003-0000-0000-0000-000000000003', 'finishing', 'per_unit',
   'Отделочные работы: штукатурка, шпаклёвка, плитка, обои. Беру под ключ от 1 комнаты.',
   25, 6);

-- ============================================================================
-- 6. Прайс-лист услуг (8 услуг по 3 категориям) — заполняет тот же блок
--    "Услуги и цены" что виден в карточке мастера у клиента.
-- ============================================================================

INSERT INTO public.master_services (
  master_id, title, price_min, price_max, unit, position
) VALUES
  -- Сантехника
  ('f0000003-0000-0000-0000-000000000003', 'Замена смесителя на кухне или ванной', 1500, 2500, 'per_task', 0),
  ('f0000003-0000-0000-0000-000000000003', 'Установка унитаза с инсталляцией', 4500, 7000, 'per_task', 1),
  ('f0000003-0000-0000-0000-000000000003', 'Подключение стиральной машины', 1800, 2500, 'per_task', 2),
  -- Электрика
  ('f0000003-0000-0000-0000-000000000003', 'Замена розетки или выключателя', 600, 1000, 'per_task', 3),
  ('f0000003-0000-0000-0000-000000000003', 'Установка люстры или светильника', 1500, 3000, 'per_task', 4),
  ('f0000003-0000-0000-0000-000000000003', 'Сборка и монтаж электрощита', 8000, 15000, 'per_task', 5),
  -- Отделка
  ('f0000003-0000-0000-0000-000000000003', 'Поклейка обоев (флизелин/винил)', 250, 400, 'per_m2', 6),
  ('f0000003-0000-0000-0000-000000000003', 'Укладка плитки на пол или стены', 800, 1200, 'per_m2', 7);

-- ============================================================================
-- 7. Портфолио (8 фото)
-- ============================================================================

INSERT INTO public.portfolio_items (
  master_id, url, storage_path, width, height, caption, sort_order
) VALUES
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-1/800/1000',
   'demo/master-personal/1.jpg', 800, 1000,
   'Замена разводки в санузле — Магас, Центральный',
   0),
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-2/800/1000',
   'demo/master-personal/2.jpg', 800, 1000,
   'Установка инсталляции и подвесного унитаза',
   1),
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-3/800/1000',
   'demo/master-personal/3.jpg', 800, 1000,
   'Электрощит на 24 модуля для частного дома',
   2),
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-4/800/1000',
   'demo/master-personal/4.jpg', 800, 1000,
   'Полная замена проводки в 3-комнатной квартире',
   3),
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-5/800/1000',
   'demo/master-personal/5.jpg', 800, 1000,
   'Укладка керамогранита в коридоре, 12 м²',
   4),
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-6/800/1000',
   'demo/master-personal/6.jpg', 800, 1000,
   'Шпаклёвка под покраску в спальне',
   5),
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-7/800/1000',
   'demo/master-personal/7.jpg', 800, 1000,
   'Установка люстры на натяжной потолок (закладная)',
   6),
  ('f0000003-0000-0000-0000-000000000003',
   'https://picsum.photos/seed/xtrud-personal-master-8/800/1000',
   'demo/master-personal/8.jpg', 800, 1000,
   'Поклейка флизелиновых обоев — комната 16 м²',
   7);

-- ============================================================================
-- 8. Заказы где этот мастер "выбран" (для таба "Меня выбрали")
--    5 заказов: 2 in_progress + 3 completed (1 без отзыва, 2 с отзывом)
-- ============================================================================

INSERT INTO public.orders (
  id, client_id, l2_id, title, description,
  city_id, district,
  urgency, budget_mode, budget_min, budget_max,
  status, picked_master_id,
  created_at, updated_at, expires_at
) VALUES
  -- (1) IN-PROGRESS — клиент Алина (главный) пишет с тобой по обоям
  ('e0000003-0000-0000-0000-000000000001'::uuid,
   'f0000001-0000-0000-0000-000000000001'::uuid,
   'finishing',
   'Поклеить обои в зале',
   'Зал 22 кв.м, флизелиновые обои уже куплены. Стены подготовлены. Нужен опытный мастер.',
   'nazran', 'Центр',
   'this_week', 'range', 8000, 14000,
   'in_progress',
   'f0000003-0000-0000-0000-000000000003'::uuid,
   now() - interval '4 days', now() - interval '1 day',
   now() + interval '30 days'),

  -- (2) IN-PROGRESS — клиент 1003 (Тамара) пишет про электрику
  ('e0000003-0000-0000-0000-000000000002'::uuid,
   'f0000011-0000-0000-0000-000000000003'::uuid,
   'electrical',
   'Установить 4 розетки и люстру',
   'Перенос 4 розеток в кухне (после ремонта старые остались криво) + установка новой люстры в зале.',
   'nazran', 'Гамурзиево',
   'this_week', 'range', 4000, 7000,
   'in_progress',
   'f0000003-0000-0000-0000-000000000003'::uuid,
   now() - interval '2 days', now() - interval '6 hours',
   now() + interval '30 days'),

  -- (3) COMPLETED БЕЗ отзыва — клиент Алина (чтобы ты со стороны мастера
  -- видел "ждём отзыв клиента", и со стороны клиента — кнопку "Оставить отзыв")
  ('e0000003-0000-0000-0000-000000000003'::uuid,
   'f0000001-0000-0000-0000-000000000001'::uuid,
   'plumbing',
   'Заменить разводку под раковиной',
   'Старая разводка под кухонной раковиной течёт. Заменить трубы и сифон.',
   'nazran', 'Центр',
   'flexible', 'range', 2500, 4500,
   'completed',
   'f0000003-0000-0000-0000-000000000003'::uuid,
   now() - interval '12 days', now() - interval '10 days',
   now() + interval '30 days'),

  -- (4) COMPLETED с положительным отзывом — клиент 1005 (Адам)
  ('e0000003-0000-0000-0000-000000000004'::uuid,
   'f0000011-0000-0000-0000-000000000005'::uuid,
   'plumbing',
   'Установить водонагреватель 80л',
   'Накопительный 80 литров куплен. Нужна установка + подключение.',
   'nazran', 'Юг',
   'this_week', 'exact', 3000, 3000,
   'completed',
   'f0000003-0000-0000-0000-000000000003'::uuid,
   now() - interval '25 days', now() - interval '24 days',
   now() + interval '30 days'),

  -- (5) COMPLETED с положительным отзывом — клиент 1002 (Ахмед, отделка)
  ('e0000003-0000-0000-0000-000000000005'::uuid,
   'f0000011-0000-0000-0000-000000000002'::uuid,
   'finishing',
   'Уложить плитку в санузле',
   'Санузел 4.5 м² пол + 8 м² стены. Плитка куплена.',
   'magas', 'Центральный',
   'this_month', 'range', 8000, 14000,
   'completed',
   'f0000003-0000-0000-0000-000000000003'::uuid,
   now() - interval '40 days', now() - interval '35 days',
   now() + interval '30 days');

-- ============================================================================
-- 9. Order responses — accepted для каждого picked-заказа + 2 sent для таба
--    "Я откликнулся" (на существующих чужих open-заказах).
-- ============================================================================

-- accepted responses (этот мастер был выбран на 5 заказах выше)
INSERT INTO public.order_responses (
  id, order_id, master_id, l2_id,
  price_min, price_max, price_mode,
  message, status, created_at
) VALUES
  (gen_random_uuid(), 'e0000003-0000-0000-0000-000000000001'::uuid,
   'f0000003-0000-0000-0000-000000000003'::uuid, 'finishing',
   9000, 12000, 'range',
   'Здравствуйте! Возьмусь, опыт с флизелином большой. Могу начать в субботу.',
   'accepted', now() - interval '4 days' + interval '2 hours'),

  (gen_random_uuid(), 'e0000003-0000-0000-0000-000000000002'::uuid,
   'f0000003-0000-0000-0000-000000000003'::uuid, 'electrical',
   5000, 6500, 'range',
   'Готов выполнить. Подъеду завтра в первой половине дня. Свой инструмент.',
   'accepted', now() - interval '2 days' + interval '1 hour'),

  (gen_random_uuid(), 'e0000003-0000-0000-0000-000000000003'::uuid,
   'f0000003-0000-0000-0000-000000000003'::uuid, 'plumbing',
   3000, 4000, 'range',
   'Возьмусь, приеду сегодня вечером. Гарантия 1 год.',
   'accepted', now() - interval '12 days' + interval '1 hour'),

  (gen_random_uuid(), 'e0000003-0000-0000-0000-000000000004'::uuid,
   'f0000003-0000-0000-0000-000000000003'::uuid, 'plumbing',
   3000, 3000, 'exact',
   'Согласен на 3000. Приеду завтра утром.',
   'accepted', now() - interval '25 days' + interval '3 hours'),

  (gen_random_uuid(), 'e0000003-0000-0000-0000-000000000005'::uuid,
   'f0000003-0000-0000-0000-000000000003'::uuid, 'finishing',
   10000, 13000, 'range',
   'Возьмусь. Все мои работы по плитке есть в портфолио. Срок — 2-3 дня.',
   'accepted', now() - interval '40 days' + interval '5 hours');

-- sent responses на чужих ОТКРЫТЫХ заказах — для таба "Я откликнулся"
-- (используем существующие open-заказы из demo-fixture)
INSERT INTO public.order_responses (
  id, order_id, master_id, l2_id,
  price_min, price_max, price_mode,
  message, status, created_at
) VALUES
  -- e0000002-…0002 = "Заменить старую проводку" (electrical, open)
  (gen_random_uuid(), 'e0000002-0000-0000-0000-000000000002'::uuid,
   'f0000003-0000-0000-0000-000000000003'::uuid, 'electrical',
   42000, 55000, 'range',
   'Готов выполнить под ключ — со щитом, проводкой и розетками. Срок 5-7 дней. Гарантия 1 год.',
   'sent', now() - interval '6 hours'),

  -- e0000002-…0010 = "Полная разводка труб 2-комн" (plumbing, open)
  (gen_random_uuid(), 'e0000002-0000-0000-0000-000000000016'::uuid,
   'f0000003-0000-0000-0000-000000000003'::uuid, 'plumbing',
   38000, 47000, 'range',
   'Возьмусь. Опыт разводок в новостройках большой. Полипропилен, гарантия 1 год.',
   'sent', now() - interval '12 hours')
ON CONFLICT (order_id, master_id) DO NOTHING;

-- ============================================================================
-- 10. Чаты + сообщения для двух IN-PROGRESS заказов
-- ============================================================================

-- Chat 1: Алина (клиент) ↔ Руслан (мастер) по заказу "Поклеить обои в зале"
DO $$
DECLARE
  v_chat_id uuid := gen_random_uuid();
  v_order_created timestamptz := now() - interval '4 days';
BEGIN
  INSERT INTO public.chats (id, order_id, client_id, master_id, created_at, last_message_at)
  VALUES (
    v_chat_id,
    'e0000003-0000-0000-0000-000000000001'::uuid,
    'f0000001-0000-0000-0000-000000000001'::uuid,
    'f0000003-0000-0000-0000-000000000003'::uuid,
    v_order_created + interval '2 hours 5 minutes',
    now() - interval '6 hours'
  );

  INSERT INTO public.messages (chat_id, sender_id, text, created_at) VALUES
    (v_chat_id, 'f0000003-0000-0000-0000-000000000003'::uuid,
     'Здравствуйте! Спасибо что выбрали. Когда удобно начать?',
     v_order_created + interval '2 hours 10 minutes'),
    (v_chat_id, 'f0000001-0000-0000-0000-000000000001'::uuid,
     'Здравствуйте! Хорошо, давайте в субботу с утра.',
     v_order_created + interval '2 hours 25 minutes'),
    (v_chat_id, 'f0000003-0000-0000-0000-000000000003'::uuid,
     'Хорошо. Буду в 9:00. Уточните адрес?',
     v_order_created + interval '2 hours 30 minutes'),
    (v_chat_id, 'f0000001-0000-0000-0000-000000000001'::uuid,
     'Назрань, ул. Чеченская 12, кв 5. Подъезд 1, домофон 5.',
     v_order_created + interval '2 hours 45 minutes'),
    (v_chat_id, 'f0000003-0000-0000-0000-000000000003'::uuid,
     'Принял. До субботы!',
     v_order_created + interval '3 hours'),
    (v_chat_id, 'f0000003-0000-0000-0000-000000000003'::uuid,
     'Закончил с первой стеной — ровно, без пузырей. Завтра доделаю остальные.',
     now() - interval '6 hours');
END $$;

-- Chat 2: Тамара ↔ Руслан по заказу "Установить 4 розетки и люстру"
DO $$
DECLARE
  v_chat_id uuid := gen_random_uuid();
  v_order_created timestamptz := now() - interval '2 days';
BEGIN
  INSERT INTO public.chats (id, order_id, client_id, master_id, created_at, last_message_at)
  VALUES (
    v_chat_id,
    'e0000003-0000-0000-0000-000000000002'::uuid,
    'f0000011-0000-0000-0000-000000000003'::uuid,
    'f0000003-0000-0000-0000-000000000003'::uuid,
    v_order_created + interval '1 hour',
    now() - interval '3 hours'
  );

  INSERT INTO public.messages (chat_id, sender_id, text, created_at) VALUES
    (v_chat_id, 'f0000003-0000-0000-0000-000000000003'::uuid,
     'Добрый день! Готов завтра в 10 утра. Подойдёт?',
     v_order_created + interval '1 hour 5 minutes'),
    (v_chat_id, 'f0000011-0000-0000-0000-000000000003'::uuid,
     'Да, подойдёт. Жду.',
     v_order_created + interval '1 hour 30 minutes'),
    (v_chat_id, 'f0000003-0000-0000-0000-000000000003'::uuid,
     'Розетки установил, люстру смонтирую через час.',
     now() - interval '3 hours');
END $$;

-- ============================================================================
-- 11. Отзывы (3 положительных) — на 3 completed-заказах
--     Триггер `recalc_master_rating` сам обновит master_profiles.rating_overall_avg/count
-- ============================================================================

-- Отзыв на заказ #4 — водонагреватель (от Адама, 5★)
INSERT INTO public.reviews (
  order_id, author_id, target_id, direction, l2_id,
  rating, text, status, created_at
) VALUES (
  'e0000003-0000-0000-0000-000000000004'::uuid,
  'f0000011-0000-0000-0000-000000000005'::uuid,
  'f0000003-0000-0000-0000-000000000003'::uuid,
  'client_to_master', 'plumbing',
  5,
  'Установил быстро и аккуратно, всё проверил. Цена честная, рекомендую!',
  'visible',
  now() - interval '23 days'
);

-- Master → Client отзыв на тот же
INSERT INTO public.reviews (
  order_id, author_id, target_id, direction, l2_id,
  rating, text, status, created_at
) VALUES (
  'e0000003-0000-0000-0000-000000000004'::uuid,
  'f0000003-0000-0000-0000-000000000003'::uuid,
  'f0000011-0000-0000-0000-000000000005'::uuid,
  'master_to_client', 'plumbing',
  5,
  'Адекватный клиент, всё чётко.',
  'visible',
  now() - interval '23 days' + interval '1 hour'
);

-- Отзыв на заказ #5 — плитка (от Ахмеда, 5★)
INSERT INTO public.reviews (
  order_id, author_id, target_id, direction, l2_id,
  rating, text, status, created_at
) VALUES (
  'e0000003-0000-0000-0000-000000000005'::uuid,
  'f0000011-0000-0000-0000-000000000002'::uuid,
  'f0000003-0000-0000-0000-000000000003'::uuid,
  'client_to_master', 'finishing',
  5,
  'Плитку положил идеально — швы ровные, ни одной "горбатой". Профессионал.',
  'visible',
  now() - interval '34 days'
);

-- Дополнительный 4★ отзыв с другого "виртуального" заказа
-- (создаём искусственный completed-заказ с минимальной обвязкой только ради
--  reviews — чтобы рейтинг был не ровно 5.0, а более правдоподобный 4.7-4.8)
INSERT INTO public.orders (
  id, client_id, l2_id, title, description,
  city_id, district,
  urgency, budget_mode, budget_min, budget_max,
  status, picked_master_id,
  created_at, updated_at, expires_at
) VALUES (
  'e0000003-0000-0000-0000-000000000099'::uuid,
  'f0000011-0000-0000-0000-000000000007'::uuid,
  'electrical',
  'Заменить выключатели в зале',
  'Заменить 3 старых выключателя на новые сенсорные.',
  'nazran', 'Центр',
  'this_week', 'exact', 2500, 2500,
  'completed',
  'f0000003-0000-0000-0000-000000000003'::uuid,
  now() - interval '55 days', now() - interval '54 days',
  now() + interval '30 days'
);

INSERT INTO public.order_responses (
  id, order_id, master_id, l2_id,
  price_min, price_max, price_mode,
  message, status, created_at
) VALUES (
  gen_random_uuid(), 'e0000003-0000-0000-0000-000000000099'::uuid,
  'f0000003-0000-0000-0000-000000000003'::uuid, 'electrical',
  2500, 2500, 'exact',
  'Сделаю быстро.',
  'accepted', now() - interval '55 days' + interval '2 hours'
);

INSERT INTO public.reviews (
  order_id, author_id, target_id, direction, l2_id,
  rating, text, status, created_at
) VALUES (
  'e0000003-0000-0000-0000-000000000099'::uuid,
  'f0000011-0000-0000-0000-000000000007'::uuid,
  'f0000003-0000-0000-0000-000000000003'::uuid,
  'client_to_master', 'electrical',
  4,
  'Сделал хорошо, но приехал на час позже договоренного.',
  'visible',
  now() - interval '53 days'
);

COMMIT;

-- ============================================================================
-- Проверка
-- ============================================================================
-- SELECT 'auth'         AS kind, 1 AS n FROM auth.users WHERE id = 'f0000003-0000-0000-0000-000000000003'
-- UNION ALL SELECT 'profile',     count(*)::int FROM public.master_profiles WHERE user_id = 'f0000003-0000-0000-0000-000000000003'
-- UNION ALL SELECT 'categories',  count(*)::int FROM public.master_categories WHERE master_id = 'f0000003-0000-0000-0000-000000000003'
-- UNION ALL SELECT 'services',    count(*)::int FROM public.master_services WHERE master_id = 'f0000003-0000-0000-0000-000000000003'
-- UNION ALL SELECT 'portfolio',   count(*)::int FROM public.portfolio_items WHERE master_id = 'f0000003-0000-0000-0000-000000000003'
-- UNION ALL SELECT 'orders',      count(*)::int FROM public.orders WHERE picked_master_id = 'f0000003-0000-0000-0000-000000000003'
-- UNION ALL SELECT 'responses',   count(*)::int FROM public.order_responses WHERE master_id = 'f0000003-0000-0000-0000-000000000003'
-- UNION ALL SELECT 'reviews-in',  count(*)::int FROM public.reviews WHERE target_id = 'f0000003-0000-0000-0000-000000000003' AND direction='client_to_master';
