-- Точная дата, к которой клиенту нужна работа. Заполняется только когда
-- urgency = 'by_date'. NULL для остальных сроков. Тип date (без времени).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preferred_date date;

COMMENT ON COLUMN public.orders.preferred_date IS
  'Точная желаемая дата выполнения (urgency=by_date). NULL для относительных сроков.';
