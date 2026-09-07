-- 0168: способ связи по заданию — отклики в приложении или напрямую.
--
-- DECISION владельца 2026-09-07: «когда создаю задание, у меня должен быть
-- выбор: мастера откликаются в приложении — или сразу звонят/пишут в WhatsApp
-- по номеру, который я оставил. Чтобы было объяснено».
--
-- Колонка orders.contact_mode (enum order_contact_mode: chat_only,
-- phone_open, phone_masked) существовала с 0009, но приложением не
-- использовалась. Смысл теперь такой:
--   chat_only  — «Отклики в приложении»: номер скрыт, мастера присылают цену
--                и срок, клиент сам выбирает, кому позвонить (по умолчанию);
--   phone_open — «Звонок или WhatsApp напрямую»: номер виден в задании,
--                мастера связываются сами, откликов в приложении нет.
--   phone_masked — не используется, оставлен ради совместимости enum.
--
-- FACT (live, 2026-09-07): 6 заданий имели phone_open без единого номера —
-- наследие старого дефолта. Они переводятся в chat_only.

UPDATE public.orders
   SET contact_mode = 'chat_only'
 WHERE contact_phone IS NULL AND whatsapp_phone IS NULL AND contact_mode <> 'chat_only';

-- Режим и номера согласованы: напрямую — есть хотя бы один номер;
-- отклики — номеров в задании нет (их незачем хранить, они не показываются).
ALTER TABLE public.orders
  ADD CONSTRAINT orders_contact_mode_consistency CHECK (
    (contact_mode = 'phone_open' AND (contact_phone IS NOT NULL OR whatsapp_phone IS NOT NULL))
    OR (contact_mode = 'chat_only' AND contact_phone IS NULL AND whatsapp_phone IS NULL)
    OR contact_mode = 'phone_masked'
  );

-- Колоночные гранты (0135): клиент задаёт режим при создании и правке.
GRANT INSERT (contact_mode), UPDATE (contact_mode) ON public.orders TO authenticated;

-- Отклик возможен только там, где клиент его ждёт. Хелпер — как
-- xtrud_private.order_client_id: читает задание мимо RLS, отдаёт одно поле.
CREATE OR REPLACE FUNCTION xtrud_private.order_accepts_responses(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $$
  SELECT o.contact_mode = 'chat_only'
  FROM public.orders AS o
  WHERE o.id = p_order_id;
$$;
REVOKE ALL ON FUNCTION xtrud_private.order_accepts_responses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION xtrud_private.order_accepts_responses(uuid) TO authenticated;

DROP POLICY IF EXISTS order_responses_contact_mode_restrictive ON public.order_responses;
CREATE POLICY order_responses_contact_mode_restrictive
  ON public.order_responses AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (COALESCE(xtrud_private.order_accepts_responses(order_id), false));

-- Проверка:
--   insert phone_open без номера → orders_contact_mode_consistency;
--   insert отклика на phone_open-задание → new row violates row-level security policy.
