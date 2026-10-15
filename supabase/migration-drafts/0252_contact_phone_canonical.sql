-- 0252: номер для связи специалиста — в форме +7XXXXXXXXXX (№345).
--
-- DECISION владельца (2026-10-15): «можешь исправлять базу». С 1.0.6
-- приложение сохраняет contact_phone/whatsapp_phone через canonicalPhone
-- (src/lib/phone.ts), но старые записи остались как их ввели.
--
-- FACT (2026-10-15, read-only): из всех телефонных колонок (users.contact_phone,
-- master_profiles.whatsapp_phone, orders.*, order_responses.*, users_private.phone)
-- не в форме +7XXXXXXXXXX только 2 строки users.contact_phone вида «8 (9XX) …».
-- Было: «8 (XXX) XXX-XX-XX». Стало: «+7XXXXXXXXXX».
--
-- Применена 2026-10-15: UPDATE 2, проверка — неправильных contact_phone 0.
--
-- Откат: прежние значения — в резервной копии на сервере
-- /opt/xtrud/backups/pre-0252-20261015-143655.dump (таблица public.users).
-- Номера и id пользователей в репозиторий не пишутся: он публичный.

BEGIN;

UPDATE public.users
   SET contact_phone = '+7' || right(regexp_replace(contact_phone, '\D', '', 'g'), 10)
 WHERE contact_phone IS NOT NULL
   AND contact_phone !~ '^\+'
   AND regexp_replace(contact_phone, '\D', '', 'g') ~ '^[78]\d{10}$';

COMMIT;
