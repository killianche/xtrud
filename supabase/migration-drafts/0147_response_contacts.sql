-- Контакты в самом отклике.
--
-- DECISION владельца 2026-09-02: при отклике человеку предлагается оставить
-- телефон и WhatsApp — каждый по желанию, но хотя бы один обязателен. Клиент
-- видит в карточке отклика ровно то, что ему оставили.
--
-- Почему в строке отклика, а не в профиле. Раньше телефон подтягивался из
-- профиля отдельным RPC на каждую карточку (два запроса на отклик), а
-- WhatsApp жил только в master_profiles — у обычного аккаунта без профиля
-- мастера ему было негде храниться. Теперь откликнуться может любой аккаунт,
-- и контакты должны ехать вместе с откликом. Заодно уходит N+1 на экране
-- откликов.
--
-- Ограничение «хотя бы один контакт» — NOT VALID: действует на новые строки,
-- существующие 35 откликов без контактов не ломает. Для них карточка
-- продолжает подтягивать телефон из профиля через get_master_phone.

BEGIN;

ALTER TABLE public.order_responses
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_phone text;

ALTER TABLE public.order_responses
  DROP CONSTRAINT IF EXISTS order_responses_contact_required;

ALTER TABLE public.order_responses
  ADD CONSTRAINT order_responses_contact_required
  CHECK (
    nullif(btrim(contact_phone), '') IS NOT NULL
    OR nullif(btrim(whatsapp_phone), '') IS NOT NULL
  ) NOT VALID;

-- Длина: телефоны E.164 не длиннее 16 символов с плюсом; оставляем запас
-- на пробелы и дефисы, которые нормализует клиент.
ALTER TABLE public.order_responses
  DROP CONSTRAINT IF EXISTS order_responses_contact_length;
ALTER TABLE public.order_responses
  ADD CONSTRAINT order_responses_contact_length
  CHECK (
    (contact_phone IS NULL OR length(contact_phone) <= 32)
    AND (whatsapp_phone IS NULL OR length(whatsapp_phone) <= 32)
  );

COMMENT ON COLUMN public.order_responses.contact_phone IS
  'Phone the responder offered with this response. At least one of contact_phone/whatsapp_phone is required for new rows (NOT VALID check).';
COMMENT ON COLUMN public.order_responses.whatsapp_phone IS
  'WhatsApp number the responder offered with this response.';

-- Колоночные права: 0135 сняла табличные привилегии и выдала список колонок.
-- Новые колонки в него не входят — без явного GRANT вставка отклика упрётся
-- в permission denied. Только INSERT: менять контакты после отправки нельзя,
-- как и остальные поля отклика.
GRANT INSERT (contact_phone, whatsapp_phone) ON public.order_responses TO authenticated;

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(x, '; ') INTO v_bad FROM (
    SELECT 'нет колонки contact_phone' AS x
      WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='order_responses' AND column_name='contact_phone')
    UNION ALL
    SELECT 'нет ограничения на обязательный контакт'
      WHERE NOT EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conrelid='public.order_responses'::regclass AND conname='order_responses_contact_required')
    UNION ALL
    SELECT 'authenticated не может вставить контакты'
      WHERE NOT has_column_privilege('authenticated','public.order_responses','contact_phone','INSERT')
        OR NOT has_column_privilege('authenticated','public.order_responses','whatsapp_phone','INSERT')
    UNION ALL
    SELECT 'authenticated может МЕНЯТЬ контакты после отправки'
      WHERE has_column_privilege('authenticated','public.order_responses','contact_phone','UPDATE')
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'response_contacts_incomplete' USING DETAIL = v_bad;
  END IF;
  RAISE NOTICE 'Контакты в отклике: колонки, ограничение и права на месте.';
END
$$;

COMMIT;
