-- 0097_remove_publish_gate_add_contact_phone.sql
-- Часть 1: убрать гейт «скрыт пока не заполнил».
--   Триггеры auto-publish (см. 0084) выставляли is_hidden_from_search автоматически.
--   Теперь мастер всегда видим в каталоге, а блок «заполните 3 пункта» — просто рекламная подсказка в UI.
--   Колонка is_hidden_from_search остаётся — для ручного тумблера «Скрыть профиль» в настройках.
--   Функцию try_publish_master() оставляем — может пригодиться для ручного вызова или будущей логики.
--
-- Часть 2: публичный контактный телефон.
--   users.contact_phone — публичное поле, видно через RLS users_select_public.
--   users_private.phone — auth-идентификатор, не трогаем, в UI не показываем.
--   Backfill: для существующих мастеров копируем users_private.phone -> users.contact_phone
--   чтобы demo-аккаунты сразу имели контактный номер по умолчанию.
--
-- Смысл whatsapp_same_as_phone теперь:
--   true  -> WhatsApp использует users.contact_phone (раньше: users_private.phone)
--   false -> WhatsApp использует master_profiles.whatsapp_phone

-- 1. Drop триггеров (фактические имена из pg_trigger):
DROP TRIGGER IF EXISTS portfolio_items_publish_check ON public.portfolio_items;
DROP TRIGGER IF EXISTS master_categories_publish_check ON public.master_categories;

-- 2. Все мастера видимы (pending -> active, is_hidden_from_search -> false).
UPDATE public.master_profiles
SET is_hidden_from_search = false,
    status = 'active'
WHERE status = 'pending' OR is_hidden_from_search = true;

-- 3. Новая колонка contact_phone в users.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

COMMENT ON COLUMN public.users.contact_phone IS
'Публичный контактный телефон для отображения клиентам. Может отличаться от users_private.phone (auth). Мастер вводит сам в онбординге.';

-- 4. Backfill из users_private.phone (только если contact_phone ещё пустой).
UPDATE public.users u
SET contact_phone = up.phone
FROM public.users_private up
WHERE u.id = up.user_id
  AND u.contact_phone IS NULL
  AND up.phone IS NOT NULL;
