-- 0051_cities_add_nazran_magas_pair.sql
--
-- Добавление виртуальной «парной» записи в cities — Назрань · Магас.
-- Назрань (~120K) и Магас (~14K, столица) географически прилегают друг к
-- другу (~6км между центрами), и часто клиенты ищут «работаю в обоих» или
-- «не важно который из двух». Эта запись даёт UX-удобство выбрать оба
-- одной кнопкой.
--
-- sort_order = 0 — выводит запись ПЕРВОЙ в picker'ах (выше «Магас» с so=1).
-- Идемпотентно (ON CONFLICT DO NOTHING).
--
-- Семантика для master feed / orders: заказ с city_id='nazran-magas' виден
-- мастерам обоих городов (потребует доп. логики в use-master-feed, см.
-- TASKS.md follow-up «расширить feed на парные city_id»).

INSERT INTO cities (id, name, sort_order) VALUES
  ('nazran-magas', 'Назрань · Магас', 0)
ON CONFLICT (id) DO NOTHING;
