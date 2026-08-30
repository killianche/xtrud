-- Migration 0065 — fix demo-login bug for personal demo-master Russian Khamkhoyev (BUGFIX).
--
-- Симптом: попытка залогиниться `+79000000003 / 000000` падает в /verify
-- с error 500 «Database error querying schema». В auth-логах:
--   "error finding user: sql: Scan error on column index 8, name
--    'email_change': converting NULL to string is unsupported"
--
-- Причина: миграция 0054_personal_demo_master.sql создавала пользователя
-- f0000003-... через INSERT INTO auth.users без явного email_change. Поле
-- получило NULL по дефолту (хотя в Supabase Auth Go-код ожидает не-NULL
-- string). Остальные seed-юзеры (миграции 0045/0046/0047 для Алины и др.)
-- этой проблемы не имели — там было SET email_change = ''.
--
-- Фикс безопасный: UPDATE email_change = '' для НАЛЬИХ записей. Меняет
-- только NULL → '' (empty string), эффект эквивалентен (auth не использует
-- это поле для логина, только для email-change-flow).

UPDATE auth.users
SET email_change = ''
WHERE email_change IS NULL;
