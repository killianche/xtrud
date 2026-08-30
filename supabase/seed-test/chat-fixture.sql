-- ============================================================================
-- Chat fixture для Maestro E2E (Sprint 21).
--
-- ⚠️  ЗАПУСКАТЬ ТОЛЬКО НА DEV / LOCAL Supabase, НЕ НА ПРОДЕ.
--     Скрипт инсертит фейковых юзеров напрямую в auth.users — это требует
--     service_role + bypassing email/phone verification flow.
--
-- Создаёт:
--   - Client user (id=11111111-..., phone=+79991110001)
--   - Master user (id=22222222-..., phone=+79992220002)
--   - Order (status=in_progress, picked_master_id=master)
--   - Order response (status=accepted)
--   - Chat (1 на этот order — UNIQUE constraint)
--   - 1 message от мастера ("Привет! Готов посмотреть смеситель.")
--
-- Идемпотентный: при повторном запуске чистит предыдущее состояние
-- через DELETE auth.users CASCADE и пересоздаёт.
--
-- Префикс для запуска:
--   psql "$DATABASE_URL" -f supabase/seed-test/chat-fixture.sql
--   (или вставить целиком в Supabase SQL Editor в local instance)
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Чистим прошлое состояние (CASCADE удалит public.users, orders, chats…)
-- ============================================================================

DELETE FROM auth.users WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

-- ============================================================================
-- 2. Создаём auth.users — phone-auth, phone_confirmed_at заполнен
--    чтобы signInWithOtp({phone}) сразу нашёл существующего юзера.
--    `encrypted_password` NULL допустим: для phone-OTP пароль не используется.
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role,
  phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at, confirmation_token, email_change_token_new, recovery_token
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated',
    '+79991110001', now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb,
    false, false, false,
    now(), now(), '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    '+79992220002', now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb,
    false, false, false,
    now(), now(), '', '', ''
  );

-- Trigger `on_auth_user_created` уже создал public.users с id+phone.
-- Доп. поля онбординга проставляем UPDATE'ом.

-- ============================================================================
-- 3. Заполняем онбординг public.users
-- ============================================================================

UPDATE public.users
SET
  first_name = 'Алина',
  last_name = 'Клиентова',
  city_id = 'nazran',
  is_master = false,
  onboarding_completed_at = now(),
  active_role = 'client'
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE public.users
SET
  first_name = 'Магомед',
  last_name = 'Мастеров',
  city_id = 'nazran',
  is_master = true,
  onboarding_completed_at = now(),
  active_role = 'master'
WHERE id = '22222222-2222-2222-2222-222222222222';

-- ============================================================================
-- 4. master_profiles — без него мастер невидим в категориях
-- ============================================================================

INSERT INTO public.master_profiles (user_id, bio, status, verification_level)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Сантехник с опытом 5 лет. Гарантия на работы.',
  'active', 1
)
ON CONFLICT (user_id) DO UPDATE SET
  bio = EXCLUDED.bio,
  status = EXCLUDED.status;

-- ============================================================================
-- 5. master_categories — мастер работает в plumbing
-- ============================================================================

INSERT INTO public.master_categories (master_id, l2_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'plumbing'
)
ON CONFLICT (master_id, l2_id) DO NOTHING;

-- ============================================================================
-- 6. Order — заказ от клиента, уже in_progress (мастер выбран)
-- ============================================================================

INSERT INTO public.orders (
  id, client_id, l2_id,
  title, description,
  city_id, urgency, budget_mode,
  status, picked_master_id,
  created_at
)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'plumbing',
  'Замена смесителя на кухне',
  'Заменить старый смеситель на новый. Подводки на месте, ключи есть.',
  'nazran', 'this_week', 'range',
  'in_progress',
  '22222222-2222-2222-2222-222222222222',
  now() - interval '2 days'
);

-- ============================================================================
-- 7. Order response — принятый отклик мастера
-- ============================================================================

INSERT INTO public.order_responses (
  id, order_id, master_id, l2_id,
  price_min, price_max, price_mode,
  message, status, created_at
)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'plumbing',
  1500, 2500, 'range',
  'Готов заменить смеситель. Приеду в течение дня, материал свой.',
  'accepted',
  now() - interval '1 day'
);

-- ============================================================================
-- 8. Chat — обычно создаётся RPC accept_response, но мы сидим напрямую
-- ============================================================================

INSERT INTO public.chats (
  id, order_id, client_id, master_id, created_at
)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  now() - interval '1 day'
)
ON CONFLICT (order_id) DO NOTHING;

-- ============================================================================
-- 9. Message — одно входящее сообщение от мастера. Trigger
--    `messages_update_chat_last_message` обновит chats.last_message_at сам.
-- ============================================================================

INSERT INTO public.messages (
  chat_id, sender_id, text, created_at
)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  'Привет! Готов посмотреть смеситель — когда удобнее подъехать?',
  now() - interval '2 hours'
);

-- ============================================================================
-- 10. Дополнительный завершённый заказ — для Maestro review smoke (Sprint 22).
--     Тот же client + master, но status='completed', без отзыва.
--     Review form должна появиться на странице заказа.
-- ============================================================================

INSERT INTO public.orders (
  id, client_id, l2_id,
  title, description,
  city_id, urgency, budget_mode,
  status, picked_master_id,
  created_at, updated_at
)
VALUES (
  '66666666-6666-6666-6666-666666666666',
  '11111111-1111-1111-1111-111111111111',
  'plumbing',
  'Установка ванны (smoke review)',
  'Тестовый заказ для проверки UI отзывов — work completed.',
  'nazran', 'this_week', 'range',
  'completed',
  '22222222-2222-2222-2222-222222222222',
  now() - interval '7 days',
  now() - interval '1 day'
);

INSERT INTO public.order_responses (
  id, order_id, master_id, l2_id,
  price_min, price_max, price_mode,
  message, status, created_at
)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  '66666666-6666-6666-6666-666666666666',
  '22222222-2222-2222-2222-222222222222',
  'plumbing',
  3000, 5000, 'range',
  'Установлю ванну под ключ. Опыт 5 лет, гарантия на работы.',
  'accepted',
  now() - interval '6 days'
);

-- Намеренно не создаём reviews — клиент должен увидеть форму «Оцените мастера»
-- и заполнить её через UI в Maestro flow.

-- ============================================================================
-- 11. Open-заказ — для Maestro order-edit smoke (Sprint E).
--     status='open' → клиент видит CTA «Редактировать заказ» (Pencil icon).
-- ============================================================================

INSERT INTO public.orders (
  id, client_id, l2_id,
  title, description,
  city_id, urgency, budget_mode,
  status,
  created_at
)
VALUES (
  '88888888-8888-8888-8888-888888888888',
  '11111111-1111-1111-1111-111111111111',
  'plumbing',
  'Edit smoke: проверить трубу',
  'Тестовый open-заказ для проверки UI редактирования.',
  'nazran', 'flexible', 'negotiable',
  'open',
  now() - interval '1 hour'
);

COMMIT;

-- ============================================================================
-- Проверка результата
-- ============================================================================
-- select count(*) from public.users where id in (
--   '11111111-1111-1111-1111-111111111111',
--   '22222222-2222-2222-2222-222222222222'
-- );  -- 2
-- select status from public.orders where id = '33333333-3333-3333-3333-333333333333';
--   -- in_progress
-- select count(*) from public.messages
--   where chat_id = '55555555-5555-5555-5555-555555555555';
--   -- 1
