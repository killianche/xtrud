-- 0164 — живые обновления только по личным уведомлениям; счётчик откликов
-- одним запросом.
--
-- FACT (pg_publication, 2026-09-06): в публикации supabase_realtime НЕ БЫЛО
-- НИ ОДНОЙ таблицы. Подписки приложения на orders и order_responses никогда
-- не получали событий — только держали соединение и гоняли RLS. Бейджи
-- обновлялись лишь по истечении staleTime.
--
-- Правильная модель (техническая роль): одна персональная подписка на
-- notifications с фильтром user_id = <я>. Таблицу уже наполняют триггеры
-- (notify_user), политика select_own есть — realtime отдаст человеку только
-- его строки. Подписки на orders/order_responses без фильтра будили бы всех
-- при каждом чужом событии — O(события × клиенты).
--
-- Счётчик непрочитанных откликов делал два запроса подряд (мои задания →
-- count по их id). Теперь одна функция.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_unread_responses_count()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT count(*)::int
  FROM public.order_responses r
  JOIN public.orders o ON o.id = r.order_id
  WHERE o.client_id = auth.uid()
    AND o.status IN ('open', 'in_progress')
    AND r.status = 'sent';
$$;
REVOKE ALL ON FUNCTION public.get_unread_responses_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_responses_count() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications') THEN
    RAISE EXCEPTION 'notifications_not_in_realtime_publication';
  END IF;
END $$;

COMMIT;
