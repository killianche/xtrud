-- Устанавливаем bcrypt-пароль 'xtrud' для всех демо-аккаунтов (+79000…),
-- чтобы фронт мог логиниться через supabase.auth.signInWithPassword({phone|email, password})
-- и попадать в существующего демо-пользователя (а не создавать нового анона).
--
-- Sprint 1 OTP по-прежнему заглушка: pin-код игнорируется, фронт сам подбирает
-- метод входа (password для +79000…, anon — для всего остального).
--
-- pgcrypto уже включён в supabase из коробки (используется extensions schema).

UPDATE auth.users
SET
  encrypted_password = crypt('xtrud', gen_salt('bf')),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, ''),
  confirmation_token = COALESCE(confirmation_token, '')
WHERE phone LIKE '+79000%';
