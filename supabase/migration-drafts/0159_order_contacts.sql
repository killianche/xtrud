-- 0159 — контакты в задании: телефон и WhatsApp по желанию.
--
-- DECISION владельца 2026-09-06: «при создании задания нужно вводить, по
-- желанию, номер телефона и WhatsApp — человек может указать не тот номер,
-- что в аккаунте». Раньше задание несло только имя (0106), а телефон
-- принципиально не хранился: модель «номер скрыт». Теперь это выбор
-- заказчика: оставил номер — его увидят те, кто откликается; не оставил —
-- всё как прежде, связь через отклик.
--
-- Формат — как у контактов в отклике (0147): нормализованный номер, до 32
-- символов. Колонки nullable, откат — DROP COLUMN.
--
-- Гранты: у authenticated на orders только КОЛОНОЧНЫЕ INSERT/UPDATE (0135).
-- Новая колонка без явного гранта невидима для записи — вставка упадёт с
-- «permission denied». Поэтому гранты выдаются здесь же и проверяются.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS contact_phone text
    CHECK (contact_phone IS NULL OR length(contact_phone) <= 32),
  ADD COLUMN IF NOT EXISTS whatsapp_phone text
    CHECK (whatsapp_phone IS NULL OR length(whatsapp_phone) <= 32);

COMMENT ON COLUMN public.orders.contact_phone IS
  'Телефон для связи по заданию, по желанию заказчика (может отличаться от аккаунта). Видят откликающиеся. Owner 2026-09-06.';
COMMENT ON COLUMN public.orders.whatsapp_phone IS
  'WhatsApp для связи по заданию, по желанию заказчика. Видят откликающиеся. Owner 2026-09-06.';

GRANT INSERT (contact_phone, whatsapp_phone) ON public.orders TO authenticated;
GRANT UPDATE (contact_phone, whatsapp_phone) ON public.orders TO authenticated;

DO $$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.orders', 'contact_phone', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.orders', 'whatsapp_phone', 'UPDATE') THEN
    RAISE EXCEPTION 'order_contacts_grants_not_applied';
  END IF;
  IF has_column_privilege('anon', 'public.orders', 'contact_phone', 'INSERT') THEN
    RAISE EXCEPTION 'order_contacts_anon_can_write';
  END IF;
END $$;

COMMIT;
