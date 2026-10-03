-- 0211: номер клиента в задании хранится только в режиме «звоните напрямую».
--
-- DECISION владельца 2026-10-03 (очередь №164): «телефоны в заданиях —
-- исправь». Аудит (xtrud-technical, 2026-10-03): у anon и authenticated
-- колоночный SELECT на orders.contact_phone / whatsapp_phone, открытые
-- задания читает кто угодно (orders_read_open_or_own). По решению владельца
-- (2026-09-22) номер в заданиях «звоните напрямую» (phone_open) виден всем,
-- включая гостя, — это и есть смысл режима. Обычный режим (chat_only) уже
-- защищён ограничением orders_contact_mode_consistency (0168): номер там
-- запрещён. Дыра — третье значение перечисления phone_masked: приложение
-- его не пишет, но ограничение пропускает phone_masked с любым номером, а
-- открытое задание читает гость (ревью xtrud-security 2026-10-03, F2).
-- Заодно старые сборки, которые шлют chat_only с номером, перестают падать
-- на ограничении: номер тихо обнуляется.
--
-- FACT на 2026-10-03 (агрегат, без персональных данных): обычных заданий с
-- номером — 0, заданий phone_open — 5. Данные не меняются.
--
-- Стало: BEFORE INSERT OR UPDATE — если режим не phone_open, contact_phone и
-- whatsapp_phone обнуляются. Гранты не трогаются: старые сборки, которые
-- выбирают эти колонки в ленте, продолжают работать (получают NULL).
-- Откат: DROP TRIGGER orders_phone_only_when_direct ON public.orders;
--        DROP FUNCTION xtrud_private.orders_phone_only_when_direct();

BEGIN;

CREATE OR REPLACE FUNCTION xtrud_private.orders_phone_only_when_direct()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.contact_mode IS DISTINCT FROM 'phone_open' THEN
    NEW.contact_phone := NULL;
    NEW.whatsapp_phone := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION xtrud_private.orders_phone_only_when_direct() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_phone_only_when_direct ON public.orders;
CREATE TRIGGER orders_phone_only_when_direct
  BEFORE INSERT OR UPDATE OF contact_mode, contact_phone, whatsapp_phone ON public.orders
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.orders_phone_only_when_direct();

-- Проверка: обычных заданий с номером не осталось.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
     WHERE contact_mode IS DISTINCT FROM 'phone_open'
       AND (contact_phone IS NOT NULL OR whatsapp_phone IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'orders_with_phone_outside_direct_mode';
  END IF;
END;
$$;

COMMIT;
