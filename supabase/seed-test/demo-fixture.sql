-- ============================================================================
-- Demo fixture (Sprint H) — полный набор тестовых данных для prod-preview.
--
-- ⚠️ ПРИМЕНЯЛОСЬ НА ПРОДЕ через MCP apply_migration в несколько этапов.
-- Этот файл — единый source-of-truth для повторного развёртывания.
--
-- Создаёт 30 фейковых пользователей + полные master_profiles + 96 фото
-- портфолио + 25 заказов в 5 статусах + 39 откликов + 12 чатов с 55
-- сообщениями + 11 отзывов (триггер recalc_master_rating сам пересчитает
-- rating_overall_avg/count).
--
-- Идемпотентный: DELETE auth.users WHERE phone LIKE '+79000%' CASCADE'ит
-- всё связанное.
--
-- ОБЯЗАТЕЛЬНЫЕ ТЕСТОВЫЕ АККАУНТЫ:
--   Client:  +7 900 000-00-01  (id f0000001-…0001)  — Алина Тестова
--   Master:  +7 900 000-00-02  (id f0000002-…0002)  — Магомед Тестов
-- OTP в Sprint 1 заглушка — любой 6-значный код.
--
-- См. DEMO_ACCOUNTS.md в корне для UI-обхода.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Cleanup предыдущего demo state (CASCADE)
-- ============================================================================

DELETE FROM auth.users WHERE phone LIKE '+79000%';

-- ============================================================================
-- 2. Главные тестовые аккаунты — client + master для логина пользователя
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at, confirmation_token, email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000001-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', '+79000000001', now() - interval '30 days',
   '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb,
   false, false, false, now() - interval '30 days', now(), '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000002-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', '+79000000002', now() - interval '30 days',
   '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb,
   false, false, false, now() - interval '30 days', now(), '', '', '');

UPDATE public.users SET
  first_name = 'Алина', last_name = 'Тестова',
  avatar_url = 'https://api.dicebear.com/9.x/shapes/png?seed=test-client-alina',
  city_id = 'nazran', district = 'Центр',
  is_master = false, is_client = true,
  onboarding_completed_at = now() - interval '30 days',
  active_role = 'client'
WHERE id = 'f0000001-0000-0000-0000-000000000001';

UPDATE public.users SET
  first_name = 'Магомед', last_name = 'Тестов',
  avatar_url = 'https://api.dicebear.com/9.x/shapes/png?seed=test-master-magomed',
  city_id = 'magas', district = 'Центральный',
  is_master = true, is_client = true,
  onboarding_completed_at = now() - interval '30 days',
  active_role = 'master'
WHERE id = 'f0000002-0000-0000-0000-000000000002';

INSERT INTO public.master_profiles (
  user_id, bio, status, verification_level,
  experience_years, has_tools, has_transport, service_radius_km,
  team_size, languages
) VALUES (
  'f0000002-0000-0000-0000-000000000002',
  'Сертифицированный сантехник с 10-летним опытом работы в Ингушетии. Выполняю весь спектр работ: от замены смесителей до полной разводки. Гарантия 1 год на все услуги.',
  'active', 2, 10, true, true, 25, 1, ARRAY['ru']
);

INSERT INTO public.master_categories (master_id, l2_id, pricing_mode, category_bio, category_radius_km) VALUES
  ('f0000002-0000-0000-0000-000000000002', 'plumbing', 'per_hour', 'Замена смесителей, унитазов, разводка труб.', 25),
  ('f0000002-0000-0000-0000-000000000002', 'electrical', 'negotiable', 'Электромонтаж от точки до полной разводки.', 20);

INSERT INTO public.portfolio_items (master_id, url, storage_path, width, height, caption, sort_order) VALUES
  ('f0000002-0000-0000-0000-000000000002', 'https://picsum.photos/seed/xtrud-master-magomed-1/800/600', 'demo/master-magomed/1.jpg', 800, 600, 'Замена смесителя в ванной — Назрань', 0),
  ('f0000002-0000-0000-0000-000000000002', 'https://picsum.photos/seed/xtrud-master-magomed-2/800/600', 'demo/master-magomed/2.jpg', 800, 600, 'Разводка труб в новостройке', 1),
  ('f0000002-0000-0000-0000-000000000002', 'https://picsum.photos/seed/xtrud-master-magomed-3/800/600', 'demo/master-magomed/3.jpg', 800, 600, 'Установка унитаза с инсталляцией', 2),
  ('f0000002-0000-0000-0000-000000000002', 'https://picsum.photos/seed/xtrud-master-magomed-4/800/600', 'demo/master-magomed/4.jpg', 800, 600, 'Электрический щиток на 18 модулей', 3),
  ('f0000002-0000-0000-0000-000000000002', 'https://picsum.photos/seed/xtrud-master-magomed-5/800/600', 'demo/master-magomed/5.jpg', 800, 600, 'Полная замена проводки 2-комн квартиры', 4);

-- ============================================================================
-- 3. 19 дополнительных мастеров + их master_profiles + categories + portfolio
--    через DO-loop по jsonb массиву.
-- ============================================================================

DO $$
DECLARE
  v_masters jsonb := '[
    {"phone":"+79000002001","first":"Иса","last":"Барахоев","city":"magas","district":"Центральный","l2":"plumbing","exp":12,"team":1,"bio":"Сантехник с 12-летним опытом. Работаю быстро и аккуратно. Гарантия на все работы."},
    {"phone":"+79000002002","first":"Руслан","last":"Гадиев","city":"nazran","district":"Гамурзиево","l2":"electrical","exp":8,"team":1,"bio":"Электрик 3-го разряда. Установка и замена проводки, розеток, выключателей. Аккуратность гарантирую."},
    {"phone":"+79000002003","first":"Хава","last":"Местоева","city":"nazran","district":"Центр","l2":"hair","exp":6,"team":1,"bio":"Парикмахер-стилист. Стрижки, окрашивание, укладки. Использую профессиональную косметику."},
    {"phone":"+79000002004","first":"Айшат","last":"Аушева","city":"magas","district":"Центральный","l2":"nails","exp":4,"team":1,"bio":"Мастер маникюра и педикюра. Аппаратный, комбинированный. Гель-лак до 4 недель носки."},
    {"phone":"+79000002005","first":"Хамзат","last":"Цечоев","city":"magas","district":"Альтиево","l2":"general-construction","exp":15,"team":4,"bio":"Бригада строителей с 15-летним опытом. От фундамента до кровли. Свои леса и техника."},
    {"phone":"+79000002006","first":"Бекхан","last":"Куштов","city":"nazran","district":"Центр","l2":"auto-service","exp":9,"team":2,"bio":"Автомеханик. Диагностика, ремонт двигателя, подвески, тормозов. Запчасти — оригинал или аналог по выбору."},
    {"phone":"+79000002007","first":"Адам","last":"Дзейтов","city":"magas","district":"Северный","l2":"cargo","exp":5,"team":1,"bio":"Грузоперевозки по республике и за её пределами. Газель 4м, рефрижератор. Помогу с погрузкой."},
    {"phone":"+79000002008","first":"Иса","last":"Мурзабеков","city":"nazran","district":"Юг","l2":"cleaning","exp":3,"team":2,"bio":"Профессиональная уборка квартир и офисов. После ремонта, генеральная, регулярная. Своё оборудование и химия."},
    {"phone":"+79000002009","first":"Лейла","last":"Мальсагова","city":"magas","district":"Центральный","l2":"cosmetology","exp":7,"team":1,"bio":"Косметолог-эстетист. Чистки, пилинги, уходы. Сертификаты КосмоТек и Holy Land."},
    {"phone":"+79000002010","first":"Зара","last":"Богатырева","city":"nazran","district":"Центр","l2":"lashes-brows","exp":5,"team":1,"bio":"Мастер по бровям и ресницам. Архитектура, окрашивание, наращивание. Lash & brow stylist."},
    {"phone":"+79000002011","first":"Тимур","last":"Озиев","city":"magas","district":"Северный","l2":"tire-service","exp":11,"team":3,"bio":"Шиномонтаж и балансировка. Все диаметры от R13 до R22. Хранение шин в межсезонье."},
    {"phone":"+79000002012","first":"Микаил","last":"Хамхоев","city":"nazran","district":"Альтиево","l2":"body-paint","exp":13,"team":2,"bio":"Кузовной ремонт и покраска. Полировка, локальная покраска, выправление вмятин без покраски (PDR)."},
    {"phone":"+79000002013","first":"Дауд","last":"Картоев","city":"magas","district":"Центральный","l2":"finishing","exp":10,"team":3,"bio":"Отделочные работы: штукатурка, шпаклёвка, покраска, обои, плитка. Чисто, аккуратно, в срок."},
    {"phone":"+79000002014","first":"Магомед","last":"Евлоев","city":"nazran","district":"Гамурзиево","l2":"windows-doors","exp":8,"team":2,"bio":"Установка пластиковых окон и дверей. Замеры, доставка, монтаж под ключ. Гарантия 5 лет."},
    {"phone":"+79000002015","first":"Бислан","last":"Ужахов","city":"magas","district":"Северный","l2":"ceilings","exp":6,"team":2,"bio":"Натяжные и подвесные потолки. Глянец, мат, фотопечать. Установка за 1 день."},
    {"phone":"+79000002016","first":"Хава","last":"Аушева","city":"nazran","district":"Центр","l2":"massage","exp":9,"team":1,"bio":"Классический, лечебный, антицеллюлитный массаж. Сертификат медцентра. Выезд на дом."},
    {"phone":"+79000002017","first":"Лиза","last":"Балкоева","city":"magas","district":"Альтиево","l2":"catering","exp":4,"team":3,"bio":"Кейтеринг на мероприятия от 10 до 200 человек. Национальная и европейская кухня. Своя посуда."},
    {"phone":"+79000002018","first":"Ислам","last":"Точиев","city":"nazran","district":"Юг","l2":"heavy-equipment","exp":14,"team":2,"bio":"Услуги спецтехники: экскаватор, погрузчик, манипулятор. По часам или сменам."},
    {"phone":"+79000002019","first":"Малика","last":"Хашиева","city":"magas","district":"Центральный","l2":"school-subjects","exp":7,"team":1,"bio":"Репетитор по математике и физике. 5-11 класс, подготовка к ОГЭ/ЕГЭ. Очно и онлайн."}
  ]'::jsonb;
  v_master jsonb;
  v_id uuid;
  v_idx int := 1;
  v_seed text;
  v_avatar_prefix text := 'https://api.dicebear.com/9.x/shapes/png?seed=';
  v_avatar_suffix text := '';
  v_photo_count int;
  i int;
BEGIN
  FOR v_master IN SELECT * FROM jsonb_array_elements(v_masters)
  LOOP
    v_id := ('f0000021-0000-0000-0000-' || LPAD(v_idx::text, 12, '0'))::uuid;
    v_seed := 'master-' || (v_master->>'phone');

    INSERT INTO auth.users (
      instance_id, id, aud, role, phone, phone_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, is_anonymous,
      created_at, updated_at, confirmation_token, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id,
      'authenticated', 'authenticated', v_master->>'phone',
      now() - interval '30 days',
      '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb,
      false, false, false, now() - (random()*30 || ' days')::interval,
      now(), '', '', ''
    );

    UPDATE public.users SET
      first_name = v_master->>'first',
      last_name = v_master->>'last',
      avatar_url = v_avatar_prefix || v_seed || v_avatar_suffix,
      city_id = v_master->>'city',
      district = v_master->>'district',
      is_master = true, is_client = true,
      onboarding_completed_at = now() - (random()*25 || ' days')::interval,
      active_role = 'master'
    WHERE id = v_id;

    INSERT INTO public.master_profiles (
      user_id, bio, status, verification_level,
      experience_years, has_tools, has_transport, service_radius_km,
      team_size, languages
    ) VALUES (
      v_id, v_master->>'bio', 'active', 1 + (random()*2)::int,
      (v_master->>'exp')::int, (random() > 0.3), (random() > 0.4),
      10 + (random()*30)::int,
      (v_master->>'team')::int, ARRAY['ru']
    );

    INSERT INTO public.master_categories (master_id, l2_id, pricing_mode, category_bio, category_radius_km)
      VALUES (v_id, v_master->>'l2', 'negotiable', v_master->>'bio', 15 + (random()*20)::int);

    v_photo_count := 3 + (random()*3)::int;
    FOR i IN 1..v_photo_count LOOP
      INSERT INTO public.portfolio_items (master_id, url, storage_path, width, height, caption, sort_order)
      VALUES (
        v_id,
        'https://picsum.photos/seed/xtrud-' || v_seed || '-' || i || '/800/600',
        'demo/' || v_seed || '/' || i || '.jpg',
        800, 600,
        'Работа №' || i || ' — ' || (v_master->>'first'),
        i - 1
      );
    END LOOP;

    v_idx := v_idx + 1;
  END LOOP;
END $$;

-- ============================================================================
-- 4. 9 дополнительных клиентов
-- ============================================================================

DO $$
DECLARE
  v_clients jsonb := '[
    {"phone":"+79000001001","first":"Марьям","last":"Дзаурова","city":"nazran","district":"Центр"},
    {"phone":"+79000001002","first":"Ахмед","last":"Ужахов","city":"magas","district":"Центральный"},
    {"phone":"+79000001003","first":"Тамара","last":"Озиева","city":"nazran","district":"Гамурзиево"},
    {"phone":"+79000001004","first":"Лилия","last":"Юсупова","city":"magas","district":"Северный"},
    {"phone":"+79000001005","first":"Адам","last":"Хамхоев","city":"nazran","district":"Юг"},
    {"phone":"+79000001006","first":"Хеда","last":"Барахоева","city":"magas","district":"Альтиево"},
    {"phone":"+79000001007","first":"Зелимхан","last":"Аушев","city":"nazran","district":"Центр"},
    {"phone":"+79000001008","first":"Сабина","last":"Мустафиева","city":"magas","district":"Центральный"},
    {"phone":"+79000001009","first":"Бекхан","last":"Гадиев","city":"nazran","district":"Гамурзиево"}
  ]'::jsonb;
  v_client jsonb;
  v_id uuid;
  v_idx int := 1;
  v_seed text;
  v_avatar_prefix text := 'https://api.dicebear.com/9.x/shapes/png?seed=';
  v_avatar_suffix text := '';
BEGIN
  FOR v_client IN SELECT * FROM jsonb_array_elements(v_clients)
  LOOP
    v_id := ('f0000011-0000-0000-0000-' || LPAD(v_idx::text, 12, '0'))::uuid;
    v_seed := 'client-' || (v_client->>'phone');

    INSERT INTO auth.users (
      instance_id, id, aud, role, phone, phone_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, is_anonymous,
      created_at, updated_at, confirmation_token, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id,
      'authenticated', 'authenticated', v_client->>'phone',
      now() - interval '60 days',
      '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb,
      false, false, false, now() - (random()*60 || ' days')::interval,
      now(), '', '', ''
    );

    UPDATE public.users SET
      first_name = v_client->>'first',
      last_name = v_client->>'last',
      avatar_url = v_avatar_prefix || v_seed || v_avatar_suffix,
      city_id = v_client->>'city',
      district = v_client->>'district',
      is_master = false, is_client = true,
      onboarding_completed_at = now() - (random()*50 || ' days')::interval,
      active_role = 'client'
    WHERE id = v_id;

    v_idx := v_idx + 1;
  END LOOP;
END $$;

-- ============================================================================
-- 5. 25 заказов в 5 статусах. См. таблицу в DEMO_ACCOUNTS.md для деталей.
-- ============================================================================

DO $$
DECLARE
  v_orders jsonb := '[
    {"id":"e0000001-0000-0000-0000-000000000001","client":"f0000001-0000-0000-0000-000000000001","l2":"plumbing","title":"Заменить смеситель на кухне","desc":"Старый течёт, нужно заменить и проверить подводку. Желательно в выходные.","status":"open","city":"nazran","district":"Центр","urgency":"this_week","bm":"range","bmin":1500,"bmax":3500,"days_ago":1},
    {"id":"e0000001-0000-0000-0000-000000000002","client":"f0000001-0000-0000-0000-000000000001","l2":"electrical","title":"Установить люстру в зале","desc":"Куплена 5-рожковая люстра, потолок натяжной, нужен опыт с креплением через закладную.","status":"open","city":"nazran","district":"Центр","urgency":"this_week","bm":"exact","bmin":2500,"bmax":2500,"days_ago":2},
    {"id":"e0000001-0000-0000-0000-000000000003","client":"f0000001-0000-0000-0000-000000000001","l2":"finishing","title":"Поклеить обои в спальне","desc":"Спальня 14 кв.м, обои уже куплены, флизелин. Нужен опытный мастер.","status":"in_progress","city":"nazran","district":"Центр","urgency":"this_month","bm":"range","bmin":6000,"bmax":10000,"picked":"f0000002-0000-0000-0000-000000000002","days_ago":5},
    {"id":"e0000001-0000-0000-0000-000000000004","client":"f0000001-0000-0000-0000-000000000001","l2":"plumbing","title":"Установить унитаз с инсталляцией","desc":"Демонтаж старого унитаза, монтаж новой инсталляции и подвесного унитаза.","status":"completed","city":"nazran","district":"Центр","urgency":"flexible","bm":"range","bmin":4000,"bmax":7000,"picked":"f0000002-0000-0000-0000-000000000002","days_ago":20},
    {"id":"e0000001-0000-0000-0000-000000000005","client":"f0000001-0000-0000-0000-000000000001","l2":"cleaning","title":"Генеральная уборка квартиры","desc":"3-комнатная квартира, 75 кв.м, после ремонта.","status":"completed","city":"nazran","district":"Центр","urgency":"this_week","bm":"range","bmin":5000,"bmax":8000,"picked":"f0000021-0000-0000-0000-000000000008","days_ago":15},
    {"id":"e0000001-0000-0000-0000-000000000006","client":"f0000001-0000-0000-0000-000000000001","l2":"hair","title":"Стрижка и окрашивание","desc":"Длинные волосы, нужна стрижка плюс сложное окрашивание шатуш.","status":"cancelled","city":"nazran","district":"Центр","urgency":"this_week","bm":"negotiable","bmin":null,"bmax":null,"days_ago":10},
    {"id":"e0000001-0000-0000-0000-000000000007","client":"f0000001-0000-0000-0000-000000000001","l2":"ceilings","title":"Натяжной потолок в зал","desc":"Зал 25 кв.м, глянцевый белый, без люстры (только точечные).","status":"expired","city":"nazran","district":"Центр","urgency":"flexible","bm":"range","bmin":12000,"bmax":18000,"days_ago":45},
    {"id":"e0000002-0000-0000-0000-000000000001","client":"f0000011-0000-0000-0000-000000000001","l2":"plumbing","title":"Прорвало трубу в санузле","desc":"Срочно! Залило соседей снизу. Нужен мастер сегодня.","status":"open","city":"nazran","district":"Гамурзиево","urgency":"urgent","bm":"negotiable","bmin":null,"bmax":null,"days_ago":0},
    {"id":"e0000002-0000-0000-0000-000000000002","client":"f0000011-0000-0000-0000-000000000002","l2":"electrical","title":"Заменить старую проводку","desc":"Квартира 60 кв.м, проводка ещё советская. Нужна полная замена плюс щиток.","status":"open","city":"magas","district":"Центральный","urgency":"this_month","bm":"range","bmin":40000,"bmax":60000,"days_ago":3},
    {"id":"e0000002-0000-0000-0000-000000000003","client":"f0000011-0000-0000-0000-000000000003","l2":"plumbing","title":"Установить водонагреватель","desc":"Накопительный 80 литров, есть собственный. Нужна установка плюс подключение.","status":"open","city":"nazran","district":"Гамурзиево","urgency":"this_week","bm":"exact","bmin":3000,"bmax":3000,"days_ago":1},
    {"id":"e0000002-0000-0000-0000-000000000004","client":"f0000011-0000-0000-0000-000000000004","l2":"hair","title":"Свадебная причёска","desc":"Невеста плюс 2 свидетельницы. Выезд на дом утром в день свадьбы.","status":"in_progress","city":"magas","district":"Северный","urgency":"this_week","bm":"exact","bmin":8000,"bmax":8000,"picked":"f0000021-0000-0000-0000-000000000003","days_ago":4},
    {"id":"e0000002-0000-0000-0000-000000000005","client":"f0000011-0000-0000-0000-000000000005","l2":"finishing","title":"Шпаклёвка и покраска стен","desc":"Квартира 50 кв.м, обновление перед новосельем.","status":"in_progress","city":"nazran","district":"Юг","urgency":"this_month","bm":"range","bmin":25000,"bmax":40000,"picked":"f0000021-0000-0000-0000-000000000013","days_ago":7},
    {"id":"e0000002-0000-0000-0000-000000000006","client":"f0000011-0000-0000-0000-000000000006","l2":"auto-service","title":"Замена сцепления","desc":"Lada Vesta 2018. Сцепление пробуксовывает. Нужен ремонт у меня в гараже.","status":"completed","city":"magas","district":"Альтиево","urgency":"this_week","bm":"range","bmin":8000,"bmax":15000,"picked":"f0000021-0000-0000-0000-000000000006","days_ago":18},
    {"id":"e0000002-0000-0000-0000-000000000007","client":"f0000011-0000-0000-0000-000000000007","l2":"massage","title":"Антицеллюлитный массаж — курс 10","desc":"Курс из 10 сеансов, выезд на дом 2-3 раза в неделю.","status":"completed","city":"nazran","district":"Центр","urgency":"flexible","bm":"exact","bmin":15000,"bmax":15000,"picked":"f0000021-0000-0000-0000-000000000016","days_ago":25},
    {"id":"e0000002-0000-0000-0000-000000000008","client":"f0000011-0000-0000-0000-000000000008","l2":"windows-doors","title":"Установить 3 пластиковых окна","desc":"Тёплая лоджия плюс кухня плюс спальня. Окна свои, нужна установка.","status":"completed","city":"magas","district":"Центральный","urgency":"this_month","bm":"range","bmin":15000,"bmax":25000,"picked":"f0000021-0000-0000-0000-000000000014","days_ago":30},
    {"id":"e0000002-0000-0000-0000-000000000009","client":"f0000011-0000-0000-0000-000000000009","l2":"tire-service","title":"Сезонный шиномонтаж","desc":"4 колеса R17, балансировка обязательна.","status":"open","city":"nazran","district":"Гамурзиево","urgency":"this_week","bm":"exact","bmin":2000,"bmax":2000,"days_ago":0},
    {"id":"e0000002-0000-0000-0000-000000000010","client":"f0000011-0000-0000-0000-000000000001","l2":"nails","title":"Маникюр с гель-лаком","desc":"Аппаратный плюс гель-лак, нюдовая палитра. Регулярно раз в 3 недели.","status":"in_progress","city":"nazran","district":"Центр","urgency":"this_week","bm":"exact","bmin":1500,"bmax":1500,"picked":"f0000021-0000-0000-0000-000000000004","days_ago":3},
    {"id":"e0000002-0000-0000-0000-000000000011","client":"f0000011-0000-0000-0000-000000000002","l2":"cargo","title":"Перевезти мебель — переезд","desc":"Двушка в трёшку. Газель 4м хватит. Помощь с погрузкой 2 человека.","status":"open","city":"magas","district":"Центральный","urgency":"this_week","bm":"range","bmin":4000,"bmax":7000,"days_ago":2},
    {"id":"e0000002-0000-0000-0000-000000000012","client":"f0000011-0000-0000-0000-000000000003","l2":"cosmetology","title":"Чистка лица плюс пилинг","desc":"Комбинированная кожа, проблемная зона T-зоны.","status":"completed","city":"nazran","district":"Гамурзиево","urgency":"flexible","bm":"exact","bmin":3500,"bmax":3500,"picked":"f0000021-0000-0000-0000-000000000009","days_ago":12},
    {"id":"e0000002-0000-0000-0000-000000000013","client":"f0000011-0000-0000-0000-000000000004","l2":"school-subjects","title":"Репетитор по математике — 11 класс","desc":"Подготовка к ЕГЭ профильному. 2 раза в неделю.","status":"in_progress","city":"magas","district":"Северный","urgency":"flexible","bm":"exact","bmin":1500,"bmax":1500,"picked":"f0000021-0000-0000-0000-000000000019","days_ago":14},
    {"id":"e0000002-0000-0000-0000-000000000014","client":"f0000011-0000-0000-0000-000000000005","l2":"catering","title":"Кейтеринг на свадьбу 80 чел","desc":"Свадьба в зале, нужна горячая подача, посуда, обслуживание.","status":"completed","city":"nazran","district":"Юг","urgency":"this_month","bm":"range","bmin":60000,"bmax":100000,"picked":"f0000021-0000-0000-0000-000000000017","days_ago":40},
    {"id":"e0000002-0000-0000-0000-000000000015","client":"f0000011-0000-0000-0000-000000000006","l2":"lashes-brows","title":"Наращивание ресниц 2D","desc":"Эффект кошачьего глаза, тёмно-коричневые.","status":"open","city":"magas","district":"Альтиево","urgency":"this_week","bm":"exact","bmin":2500,"bmax":2500,"days_ago":1},
    {"id":"e0000002-0000-0000-0000-000000000016","client":"f0000011-0000-0000-0000-000000000007","l2":"plumbing","title":"Полная разводка труб 2-комн","desc":"Новостройка, голая бетонная коробка. Нужна полная разводка ХВС/ГВС/канализация.","status":"open","city":"nazran","district":"Центр","urgency":"this_month","bm":"range","bmin":35000,"bmax":50000,"days_ago":4},
    {"id":"e0000002-0000-0000-0000-000000000017","client":"f0000011-0000-0000-0000-000000000008","l2":"heavy-equipment","title":"Экскаватор на 1 смену","desc":"Котлован под фундамент 6x8м, глубина 1.5м.","status":"cancelled","city":"magas","district":"Центральный","urgency":"this_week","bm":"exact","bmin":12000,"bmax":12000,"days_ago":8},
    {"id":"e0000002-0000-0000-0000-000000000018","client":"f0000011-0000-0000-0000-000000000009","l2":"body-paint","title":"Покрасить заднее крыло","desc":"Hyundai Solaris, белый перламутр. Локальная покраска одного крыла.","status":"open","city":"nazran","district":"Гамурзиево","urgency":"this_week","bm":"range","bmin":5000,"bmax":9000,"days_ago":2}
  ]'::jsonb;
  v_order jsonb;
  v_picked uuid;
BEGIN
  FOR v_order IN SELECT * FROM jsonb_array_elements(v_orders)
  LOOP
    v_picked := CASE WHEN v_order ? 'picked' THEN (v_order->>'picked')::uuid ELSE NULL END;
    INSERT INTO public.orders (
      id, client_id, l2_id, title, description, city_id, district,
      urgency, budget_mode, budget_min, budget_max,
      status, picked_master_id, created_at, updated_at, expires_at
    ) VALUES (
      (v_order->>'id')::uuid, (v_order->>'client')::uuid, v_order->>'l2',
      v_order->>'title', v_order->>'desc', v_order->>'city', v_order->>'district',
      (v_order->>'urgency')::order_urgency, (v_order->>'bm')::order_budget_mode,
      CASE WHEN jsonb_typeof(v_order->'bmin') = 'null' THEN NULL ELSE (v_order->>'bmin')::int END,
      CASE WHEN jsonb_typeof(v_order->'bmax') = 'null' THEN NULL ELSE (v_order->>'bmax')::int END,
      (v_order->>'status')::order_status, v_picked,
      now() - ((v_order->>'days_ago')::int || ' days')::interval,
      now() - ((v_order->>'days_ago')::int || ' days')::interval,
      CASE WHEN v_order->>'status' = 'expired' THEN now() - interval '1 day' ELSE now() + interval '30 days' END
    );
  END LOOP;
END $$;

-- ============================================================================
-- 6. Order responses — для каждого заказа в зависимости от status:
--    - open → 1-3 sent/viewed от случайных мастеров этой категории
--    - in_progress/completed → accepted (picked_master) + 0-1 rejected
--    - cancelled/expired → 0-1 withdrawn
-- ============================================================================

DO $$
DECLARE
  v_order record;
  v_status response_status;
  v_other_masters uuid[];
  v_responder uuid;
  v_count int;
  v_pmin int; v_pmax int;
  i int;
  v_messages text[] := ARRAY[
    'Готов выполнить, цена 2500 руб. Приеду в течение дня.',
    'Возьмусь. Опыт 8 лет, гарантия. Сделаю быстро и аккуратно.',
    'Здравствуйте! Готов помочь, обсудим детали в чате.',
    'Свободен в эти выходные. Цена ваша — договоримся.',
    'Сделаю за 1 день, свой инструмент и материал.',
    'Возьмусь, но цена немного выше. Зато гарантия 1 год на работы.',
    'Готов выехать сегодня. Опыт большой, фото работ есть в профиле.',
    'Здравствуйте, занимаюсь этим 10+ лет. Согласен на ваш бюджет.'
  ];
BEGIN
  FOR v_order IN
    SELECT id, l2_id, client_id, status, picked_master_id, created_at
    FROM public.orders WHERE id::text LIKE 'e0000%'
    ORDER BY created_at
  LOOP
    SELECT array_agg(mc.master_id ORDER BY random()) INTO v_other_masters
    FROM public.master_categories mc
    WHERE mc.l2_id = v_order.l2_id AND mc.master_id != v_order.client_id
      AND (v_order.picked_master_id IS NULL OR mc.master_id != v_order.picked_master_id);

    IF v_other_masters IS NULL OR array_length(v_other_masters, 1) IS NULL THEN
      SELECT array_agg(user_id ORDER BY random()) INTO v_other_masters
      FROM public.master_profiles
      WHERE user_id != v_order.client_id
        AND (v_order.picked_master_id IS NULL OR user_id != v_order.picked_master_id);
    END IF;

    IF v_order.picked_master_id IS NOT NULL THEN
      v_pmin := 1500 + (random()*1500)::int;
      v_pmax := v_pmin + 500 + (random()*3000)::int;
      INSERT INTO public.order_responses (
        id, order_id, master_id, l2_id, price_min, price_max, price_mode,
        message, status, created_at
      ) VALUES (
        gen_random_uuid(), v_order.id, v_order.picked_master_id, v_order.l2_id,
        v_pmin, v_pmax, 'range',
        v_messages[1 + (random()*7)::int],
        'accepted', v_order.created_at + interval '2 hours'
      ) ON CONFLICT (order_id, master_id) DO NOTHING;
    END IF;

    v_count := CASE v_order.status
      WHEN 'open' THEN 1 + (random()*3)::int
      ELSE (random()*2)::int
    END;

    v_status := CASE v_order.status
      WHEN 'open' THEN (CASE WHEN random() > 0.5 THEN 'sent' ELSE 'viewed' END)::response_status
      WHEN 'in_progress' THEN 'rejected'::response_status
      WHEN 'completed' THEN 'rejected'::response_status
      WHEN 'cancelled' THEN 'withdrawn'::response_status
      WHEN 'expired' THEN 'withdrawn'::response_status
      ELSE 'sent'::response_status
    END;

    FOR i IN 1..LEAST(v_count, COALESCE(array_length(v_other_masters, 1), 0))
    LOOP
      v_responder := v_other_masters[i];
      v_pmin := 1500 + (random()*1500)::int;
      v_pmax := v_pmin + 500 + (random()*3000)::int;
      INSERT INTO public.order_responses (
        id, order_id, master_id, l2_id, price_min, price_max, price_mode,
        message, status, created_at
      ) VALUES (
        gen_random_uuid(), v_order.id, v_responder, v_order.l2_id,
        v_pmin, v_pmax, 'range',
        v_messages[1 + (random()*7)::int],
        v_status,
        v_order.created_at + interval '3 hours' + (i * interval '1 hour')
      ) ON CONFLICT (order_id, master_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 7. Chats + messages для всех заказов с picked_master_id
-- ============================================================================

DO $$
DECLARE
  v_order record;
  v_chat_id uuid;
  v_msg_count int;
  v_idx int;
  v_sender uuid;
  v_text text;
  v_client_msgs text[] := ARRAY[
    'Здравствуйте! Когда сможете приехать?',
    'Спасибо за отклик. У вас опыт большой?',
    'Хорошо, давайте на завтра. Во сколько удобнее?',
    'Адрес я отправлю в личку.',
    'Цена нормальная. Согласен.',
    'Я дома буду весь день, подъезжайте удобное время.',
    'Если нужны материалы — могу купить сам, скажите марку.',
    'Понял, спасибо! Жду вас.'
  ];
  v_master_msgs text[] := ARRAY[
    'Добрый день! Могу подъехать сегодня после 17:00.',
    'Опыт 10+ лет, фото работ есть в профиле.',
    'Завтра удобно с 10 до 12. Адрес скиньте?',
    'Получил адрес, выезжаю.',
    'Материал свой, цена включена. Дополнительно ничего покупать не нужно.',
    'Буду через час.',
    'Если что-то изменится — напишите, скорректирую время.',
    'До встречи!'
  ];
BEGIN
  FOR v_order IN
    SELECT id, client_id, picked_master_id, created_at, status
    FROM public.orders
    WHERE picked_master_id IS NOT NULL AND id::text LIKE 'e0000%'
    ORDER BY created_at
  LOOP
    v_chat_id := gen_random_uuid();

    INSERT INTO public.chats (id, order_id, client_id, master_id, created_at)
    VALUES (v_chat_id, v_order.id, v_order.client_id, v_order.picked_master_id,
            v_order.created_at + interval '2 hours 5 minutes')
    ON CONFLICT (order_id) DO NOTHING;

    v_msg_count := 3 + (random()*4)::int;

    FOR v_idx IN 1..v_msg_count LOOP
      IF v_idx % 2 = 1 THEN
        v_sender := v_order.picked_master_id;
        v_text := v_master_msgs[1 + ((v_idx-1)/2) % array_length(v_master_msgs, 1)];
      ELSE
        v_sender := v_order.client_id;
        v_text := v_client_msgs[1 + ((v_idx-1)/2) % array_length(v_client_msgs, 1)];
      END IF;

      INSERT INTO public.messages (chat_id, sender_id, text, created_at)
      VALUES (
        v_chat_id, v_sender, v_text,
        v_order.created_at + interval '2 hours 10 minutes' + (v_idx * interval '15 minutes')
      );
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 8. Reviews (dual direction) для completed-заказов.
--    Первый completed test-client+test-master намеренно оставляем без отзыва —
--    чтобы пользователь мог сам кликнуть «Оставить отзыв».
--    Триггер recalc_master_rating пересчитает master_profiles.rating_overall_*
-- ============================================================================

DO $$
DECLARE
  v_order record;
  v_skip_first boolean := true;
  v_client_texts text[] := ARRAY[
    'Мастер отличный! Приехал вовремя, всё сделал чисто и быстро. Цена соответствует качеству.',
    'Очень доволен работой. Рекомендую — профессионал своего дела.',
    'Хороший мастер, всё аккуратно. Цена немного выше ожиданий, но качество того стоит.',
    'Спасибо! Отзывчивый, ответственный, сделал даже больше чем договаривались.',
    'Работа выполнена качественно. Буду обращаться ещё.',
    'Безупречная работа. Чисто, быстро, по разумной цене.'
  ];
  v_master_texts text[] := ARRAY[
    'Адекватный клиент, всё чётко.',
    'Спасибо! Приятно работать с такими клиентами.',
    'Рекомендую — точный по времени и оплате.',
    'Хороший заказчик, рекомендую коллегам.'
  ];
BEGIN
  FOR v_order IN
    SELECT id, client_id, picked_master_id, l2_id, created_at
    FROM public.orders
    WHERE status = 'completed' AND id::text LIKE 'e0000%' AND picked_master_id IS NOT NULL
    ORDER BY created_at
  LOOP
    IF v_skip_first
       AND v_order.client_id = 'f0000001-0000-0000-0000-000000000001'::uuid
       AND v_order.picked_master_id = 'f0000002-0000-0000-0000-000000000002'::uuid THEN
      v_skip_first := false;
      CONTINUE;
    END IF;

    INSERT INTO public.reviews (
      order_id, author_id, target_id, direction, l2_id, rating, text, status, created_at
    ) VALUES (
      v_order.id, v_order.client_id, v_order.picked_master_id,
      'client_to_master', v_order.l2_id,
      4 + (random())::int,
      v_client_texts[1 + (random()*5)::int],
      'visible', v_order.created_at + interval '1 day'
    );

    IF random() > 0.3 THEN
      INSERT INTO public.reviews (
        order_id, author_id, target_id, direction, l2_id, rating, text, status, created_at
      ) VALUES (
        v_order.id, v_order.picked_master_id, v_order.client_id,
        'master_to_client', v_order.l2_id,
        4 + (random())::int,
        v_master_texts[1 + (random()*3)::int],
        'visible', v_order.created_at + interval '1 day 2 hours'
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- Проверка
-- ============================================================================
-- SELECT 'users'         AS kind, count(*) FROM public.users           WHERE id::text LIKE 'f0000%'
-- UNION ALL SELECT 'masters',      count(*) FROM public.master_profiles WHERE user_id::text LIKE 'f0000%'
-- UNION ALL SELECT 'portfolio',    count(*) FROM public.portfolio_items WHERE master_id::text LIKE 'f0000%'
-- UNION ALL SELECT 'orders',       count(*) FROM public.orders         WHERE id::text LIKE 'e0000%'
-- UNION ALL SELECT 'responses',    count(*) FROM public.order_responses WHERE order_id::text LIKE 'e0000%'
-- UNION ALL SELECT 'chats',        count(*) FROM public.chats          WHERE order_id::text LIKE 'e0000%'
-- UNION ALL SELECT 'reviews',      count(*) FROM public.reviews        WHERE order_id::text LIKE 'e0000%';
