-- 0045_orders_city_optional.sql
--
-- Сделать orders.city_id опциональным — клиент может опубликовать заказ
-- без привязки к конкретному городу («Вся Ингушетия»). Мастера из любого
-- города увидят такой заказ в ленте, если в их зоне покрытия.
--
-- FK на cities(id) и индекс orders_city_id_idx сохраняются — b-tree индекс
-- корректно работает с NULL (не индексирует), фильтрация `WHERE city_id IS NULL`
-- остаётся seq-scan'ом, но объём заказов «Вся Ингушетия» мал.

ALTER TABLE public.orders ALTER COLUMN city_id DROP NOT NULL;
