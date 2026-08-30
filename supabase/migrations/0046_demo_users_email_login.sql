-- Phone-login отключён в Supabase Auth provider settings. Чтобы клиент-сайд
-- мог войти в существующий демо-аккаунт без service_role, добавляем e-mail
-- + identity для каждого +79000…-телефона и подтверждаем email.
--
-- Логин на фронте: supabase.auth.signInWithPassword({ email, password: 'xtrud' }),
-- где email = `<digits-from-phone>@xtrud-demo.local`.
-- Пример: +79000000001 → 79000000001@xtrud-demo.local.

UPDATE auth.users
SET
  email = regexp_replace(phone, '^\+', '') || '@xtrud-demo.local',
  email_confirmed_at = COALESCE(email_confirmed_at, phone_confirmed_at, now()),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
    '{"provider":"email","providers":["email","phone"]}'::jsonb
WHERE phone LIKE '+79000%';

-- Identity-запись для email (нужна Supabase для login). Уникальный provider_id = user_id.
INSERT INTO auth.identities (
  id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  'email',
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', true),
  now(), now(), now()
FROM auth.users u
WHERE u.phone LIKE '+79000%'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );
