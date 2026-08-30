-- 0108: логика нового нейтрального статуса 'unspecified' (см. 0107).
--
-- 1) Истёкшие срочные статусы → 'unspecified' (а НЕ 'unavailable').
--    Мастер, не продливший таймер, становится нейтральным «готов» без штрафа.
CREATE OR REPLACE FUNCTION public.expire_availability()
  RETURNS integer
  LANGUAGE sql
AS $function$
  WITH expired AS (
    UPDATE public.master_profiles
    SET availability_status = 'unspecified', availability_until = NULL, updated_at = now()
    WHERE availability_until IS NOT NULL AND availability_until < now()
    RETURNING 1
  )
  SELECT count(*)::int FROM expired;
$function$;

-- 2) Новые мастера по умолчанию — нейтральный 'unspecified' (а не 'unavailable').
--    Так свежезарегистрированный мастер сразу в обычной выдаче, без штрафа.
ALTER TABLE public.master_profiles
  ALTER COLUMN availability_status SET DEFAULT 'unspecified';

-- 3) Разовый сброс: текущие 'unavailable' (в основном авто-истёкшие по старой
--    логике) → 'unspecified'. Большинство стали «недоступны» не по своей воле.
--    Кто реально недоступен — поставит статус заново.
UPDATE public.master_profiles
SET availability_status = 'unspecified', availability_until = NULL
WHERE availability_status = 'unavailable';

-- _availability_expires_at уже возвращает NULL для любого не-срочного статуса
-- (ветка ELSE), поэтому set_availability('unspecified') корректно ставит
-- availability_until = NULL без правок. Менять её не нужно.
