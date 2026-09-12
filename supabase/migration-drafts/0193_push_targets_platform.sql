-- 0193 — push_targets отдаёт платформу устройства.
--
-- Зачем. До сих пор push был только у iPhone, и отправитель слал каждый токен
-- в APNs. С появлением Android (RuStore Push, DECISION владельца 2026-09-12)
-- это стало неверным: Android-токен ушёл бы к Apple и был бы удалён как чужой
-- при первом же уведомлении.
--
-- Колонка platform в public.notification_tokens объявлена в 0017 (NOT NULL,
-- CHECK ('ios','android','web')) и заполняется приложением; функция её просто
-- не отдавала. UNKNOWN на 2026-09-12: живая схема Beget не сверена — доступ к
-- production-базе в этой сессии закрыт. Перед применением выполнить:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='notification_tokens';
--
-- Совместимость и порядок раскатки: сначала эта миграция, затем новый образ
-- xtrud-api. Старый сервер выбирает только три колонки из четырёх и после
-- миграции работает как прежде; новый сервер без миграции упал бы на каждом
-- уведомлении — колонки platform в ответе функции ещё нет.
BEGIN;

DROP FUNCTION IF EXISTS xtrud_api.push_targets(uuid);

CREATE FUNCTION xtrud_api.push_targets(p_user_id uuid)
RETURNS TABLE(device_token text, environment text, platform text, unread integer)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT t.device_token,
         t.environment,
         COALESCE(t.platform, 'ios') AS platform,
         (SELECT count(*)::int FROM public.notifications n
           WHERE n.user_id = p_user_id AND n.read_at IS NULL) AS unread
    FROM public.notification_tokens t
   WHERE t.user_id = p_user_id;
$$;

-- Права те же, что задавала 0180b: владелец — postgres, выполнять может
-- только роль API.
ALTER FUNCTION xtrud_api.push_targets(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION xtrud_api.push_targets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xtrud_api.push_targets(uuid) TO xtrud_api;

COMMIT;

-- Проверка после применения:
--   SELECT pg_get_function_result(oid) FROM pg_proc
--    WHERE proname = 'push_targets'
--      AND pronamespace = 'xtrud_api'::regnamespace;
--   ожидается: TABLE(device_token text, environment text, platform text, unread integer)
