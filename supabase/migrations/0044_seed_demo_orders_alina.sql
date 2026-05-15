-- 0044_seed_demo_orders_alina.sql
--
-- Sprint J: demo-данные для test-клиента Алины Тестовой (+79000000001).
-- Логин в preview: ввести phone +79000000001 → OTP из Supabase Auth → Logs.
--
-- 4 заказа разных статусов:
--   1. Open       — есть 3 отклика, мастер не выбран
--   2. In_progress — выбран Бекхан, есть чат с перепиской 6 messages
--   3. Completed   — отзыв 5★ оставлен
--   4. Expired     — никто не откликнулся за неделю

DO $$
DECLARE
  v_alina   uuid := 'f0000001-0000-0000-0000-000000000001'::uuid;
  v_bekhan  uuid := 'f0000021-0000-0000-0000-000000000006'::uuid;
  v_isa     uuid := 'f0000021-0000-0000-0000-000000000001'::uuid;
  v_islam   uuid := 'f0000021-0000-0000-0000-000000000018'::uuid;
  v_adam    uuid := 'f0000021-0000-0000-0000-000000000007'::uuid;
  v_order_open uuid;
  v_order_inprogress uuid;
  v_order_completed uuid;
  v_order_expired uuid;
  v_chat_id uuid;
BEGIN
  DELETE FROM public.orders WHERE client_id = v_alina AND title LIKE 'demo:%';

  -- 1. OPEN
  INSERT INTO public.orders (
    client_id, l2_id, title, description, city_id, status,
    budget_mode, budget_min, budget_max, urgency, created_at
  ) VALUES (
    v_alina, 'plumbing',
    'demo: Замена смесителя на кухне',
    'Старый смеситель течёт, нужно заменить на новый. Смеситель куплю сама — нужна только установка.',
    'magas', 'open', 'range', 2000, 4000, 'this_week',
    now() - interval '2 hours'
  ) RETURNING id INTO v_order_open;

  INSERT INTO public.order_responses (order_id, master_id, l2_id, message, price_min, price_max, price_mode, status, created_at) VALUES
    (v_order_open, v_isa, 'plumbing',  'Здравствуйте! Готов сделать сегодня вечером, есть свой инструмент.', 2200, 2200, 'exact', 'sent', now() - interval '90 minutes'),
    (v_order_open, v_islam, 'plumbing','Бригада, можем приехать за 1 час. Гарантия на работу 6 мес.', 2500, 3000, 'range', 'sent', now() - interval '60 minutes'),
    (v_order_open, v_adam, 'plumbing', 'Свободен завтра утром, цена 1800 если смеситель готов.', 1800, 1800, 'exact', 'viewed', now() - interval '20 minutes');

  -- 2. IN_PROGRESS — Бекхан выбран, чат
  INSERT INTO public.orders (
    client_id, l2_id, title, description, city_id, status, picked_master_id,
    budget_mode, budget_min, budget_max, urgency, created_at, updated_at
  ) VALUES (
    v_alina, 'electrical',
    'demo: Установить люстру в зале',
    'Купила новую люстру, нужен электрик. Старая снята, провода готовы.',
    'magas', 'in_progress', v_bekhan,
    'exact', 1500, 1500, 'this_week',
    now() - interval '2 days', now() - interval '1 day'
  ) RETURNING id INTO v_order_inprogress;

  INSERT INTO public.order_responses (order_id, master_id, l2_id, message, price_min, price_max, price_mode, status, created_at) VALUES
    (v_order_inprogress, v_bekhan, 'electrical', 'Возьмусь. Завтра в 14:00 удобно?', 1500, 1500, 'exact', 'accepted', now() - interval '2 days');

  INSERT INTO public.chats (client_id, master_id, order_id, last_message_at, created_at)
  VALUES (v_alina, v_bekhan, v_order_inprogress, now() - interval '20 minutes', now() - interval '2 days')
  RETURNING id INTO v_chat_id;

  INSERT INTO public.messages (chat_id, sender_id, text, created_at) VALUES
    (v_chat_id, v_alina,  'Здравствуйте! Можно завтра в 14:00?', now() - interval '36 hours'),
    (v_chat_id, v_bekhan, 'Здравствуйте, Алина! Да, удобно. Адрес?', now() - interval '35 hours'),
    (v_chat_id, v_alina,  'Магас, ул. Зязикова 14, кв 23. Подъезд 3, домофон 23.', now() - interval '34 hours'),
    (v_chat_id, v_bekhan, 'Принял. Возьму свою стремянку и инструмент.', now() - interval '33 hours'),
    (v_chat_id, v_alina,  'Отлично! Жду вас.', now() - interval '32 hours'),
    (v_chat_id, v_bekhan, 'Уже в пути, буду через 15 минут.', now() - interval '20 minutes');

  -- 3. COMPLETED + review
  INSERT INTO public.orders (
    client_id, l2_id, title, description, city_id, status, picked_master_id,
    completed_at, budget_mode, budget_min, urgency, created_at, updated_at
  ) VALUES (
    v_alina, 'painting',
    'demo: Покрасить стену на кухне',
    'Облезла краска на одной стене 3 кв.м. Нужно подобрать в цвет и закрасить.',
    'magas', 'completed', v_islam,
    now() - interval '5 days', 'exact', 3000, 'flexible',
    now() - interval '14 days', now() - interval '5 days'
  ) RETURNING id INTO v_order_completed;

  INSERT INTO public.reviews (author_id, target_id, order_id, l2_id, direction, rating, text, status, created_at) VALUES
    (v_alina, v_islam, v_order_completed, 'painting', 'client_to_master', 5,
     'Сделали быстро и аккуратно. Цвет подобрали идеально, шва не видно. Рекомендую!',
     'visible', now() - interval '4 days');

  -- 4. EXPIRED
  INSERT INTO public.orders (
    client_id, l2_id, title, description, city_id, status,
    budget_mode, budget_min, budget_max, urgency, created_at, updated_at, expires_at
  ) VALUES (
    v_alina, 'interior-design',
    'demo: Дизайн-проект кухни 12 м²',
    'Хочу обновить кухню. Нужен дизайн-проект с 3D-визуализацией.',
    'magas', 'expired',
    'range', 15000, 30000, 'flexible',
    now() - interval '14 days', now() - interval '7 days',
    now() - interval '7 days'
  );
END $$;
