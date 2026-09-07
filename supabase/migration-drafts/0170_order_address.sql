-- 0170: адрес задания — улица и дом, по желанию.
--
-- DECISION владельца 2026-09-07: «указывается только город; нужно
-- дополнительное поле — улица, дом и так далее, по желанию».
-- Хранится как одна строка до 120 символов; квартиру/подъезд не спрашиваем.
-- Видимость — как у самого задания (anon читает orders табличным SELECT,
-- поле не секретнее телефона в режиме «напрямую»).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS address text
  CONSTRAINT orders_address_check CHECK (address IS NULL OR length(address) <= 120);

GRANT INSERT (address), UPDATE (address) ON public.orders TO authenticated;
