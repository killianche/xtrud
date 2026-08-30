-- Supabase GoTrue не толерирует NULL в *_token / *_change полях,
-- ожидает пустую строку. После заливки demo-fixture поля остались NULL
-- → ошибка "Scan error on column ... converting NULL to string is unsupported".

UPDATE auth.users
SET
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE phone LIKE '+79000%';
