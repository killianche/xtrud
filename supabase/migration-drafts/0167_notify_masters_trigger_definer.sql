-- 0167: триггер рассылки «новое задание» — SECURITY DEFINER.
--
-- FACT (live Beget, 2026-09-07 02:12 UTC): публикация задания из сборки 36
-- получала 403 на POST /rest/v1/orders. Причина: 0163 перевёл рассылку в
-- очередь order_broadcast_queue и закрыл таблицу от anon/authenticated, а
-- триггер trg_notify_masters_on_new_order остался SECURITY INVOKER — он
-- выполнялся от роли authenticated и не мог вставить строку в очередь.
-- Insert заказа откатывался целиком; загруженные фото удалялись клиентом.
--
-- Триггер выполняет только вставку id заказа в очередь; проверок доступа в
-- нём нет и не нужно — сам insert заказа уже прошёл RLS orders_insert_own.

ALTER FUNCTION public.trg_notify_masters_on_new_order() SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.trg_notify_masters_on_new_order() FROM PUBLIC, anon, authenticated;

-- Проверка (ожидается secdef=true):
--   SELECT prosecdef FROM pg_proc WHERE proname='trg_notify_masters_on_new_order';
