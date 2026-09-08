-- 0180 — push через свой сервер и напрямую в Apple.
--
-- Было: notify_user писал уведомление в БД и звал edge-функцию Supabase
-- `notify`, а та отправляла сообщение в Expo Push (exp.host). Два чужих
-- звена: рантайм Deno внутри стека Supabase и сервис Expo как отправитель.
-- Токен устройства при этом был токеном Expo (`expo_token`).
--
-- Стало: notify_user зовёт наш `xtrud-api`, а он открывает HTTP/2-соединение
-- прямо к api.push.apple.com с ключом APNs. Токен в таблице — родной токен
-- устройства от Apple, поэтому колонка переименована.
--
-- Данные не теряются: на момент миграции зарегистрированных токенов ноль
-- (проверено запросом 2026-09-08), а старые токены Expo для APNs всё равно
-- непригодны — их пришлось бы получать заново на устройствах.

BEGIN;

-- 1. Токен устройства вместо токена Expo.
ALTER TABLE public.notification_tokens RENAME COLUMN expo_token TO device_token;
ALTER TABLE public.notification_tokens
  RENAME CONSTRAINT notification_tokens_expo_token_check TO notification_tokens_device_token_check;
ALTER TABLE public.notification_tokens
  RENAME CONSTRAINT notification_tokens_expo_token_key TO notification_tokens_device_token_key;

-- Окружение APNs у токена своё: сборка из TestFlight и App Store работает с
-- production, отладочная — с sandbox. Один и тот же телефон может дать оба
-- токена, поэтому отправитель обязан знать, в какое окружение слать.
ALTER TABLE public.notification_tokens
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';
ALTER TABLE public.notification_tokens
  DROP CONSTRAINT IF EXISTS notification_tokens_environment_check;
ALTER TABLE public.notification_tokens
  ADD CONSTRAINT notification_tokens_environment_check
  CHECK (environment IN ('production', 'sandbox'));

COMMENT ON COLUMN public.notification_tokens.device_token IS
  'Родной токен устройства APNs (hex). Раньше здесь был токен Expo Push.';
COMMENT ON COLUMN public.notification_tokens.environment IS
  'Окружение APNs токена: production (TestFlight, App Store) или sandbox (отладка).';

-- 2. notify_user идёт в свой сервер, а не в edge-функцию.
--    Тело функции сохранено полностью; изменился только адрес.
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_secret text;
  -- Контейнеры xtrud-api и supabase-db в одной сети supabase_default,
  -- поэтому адрес внутренний: наружу этот маршрут не открыт.
  v_url text := 'http://xtrud-api:8100/v2/internal/push';
  v_type public.notification_type;
  v_data_type text;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  v_data_type := COALESCE(p_data->>'type', 'system');
  BEGIN
    v_type := v_data_type::public.notification_type;
  EXCEPTION WHEN invalid_text_representation THEN
    v_type := 'system';
  END;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p_user_id, v_type, p_title, COALESCE(p_body, ''), COALESCE(p_data, '{}'::jsonb));

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
  WHERE name = 'notify_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_user: notify_secret missing from vault';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'user_id', p_user_id, 'title', p_title, 'body', p_body,
        'data', COALESCE(p_data, '{}'::jsonb)
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
      timeout_milliseconds := 2000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_user: http_post failed: %', SQLERRM;
  END;
END;
$function$;

COMMIT;

-- 0180b — доступ отправителя к токенам.
--
-- У роли xtrud_api намеренно нет прав на таблицы public (0177c): всё, что ей
-- нужно, она получает через функции владельца базы. Push не исключение —
-- иначе пришлось бы открыть таблицу с токенами устройств целиком.
BEGIN;

CREATE OR REPLACE FUNCTION xtrud_api.push_targets(p_user_id uuid)
RETURNS TABLE(device_token text, environment text, unread integer)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT t.device_token,
         t.environment,
         (SELECT count(*)::int FROM public.notifications n
           WHERE n.user_id = p_user_id AND n.read_at IS NULL) AS unread
    FROM public.notification_tokens t
   WHERE t.user_id = p_user_id;
$$;

-- Удаляем только те токены, которые Apple назвала мёртвыми. Список приходит
-- от отправителя, поэтому функция не принимает user_id: чужой токен и так
-- нельзя удалить осмысленно, не зная его целиком.
CREATE OR REPLACE FUNCTION xtrud_api.drop_dead_push_tokens(p_tokens text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.notification_tokens WHERE device_token = ANY(p_tokens);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['push_targets(uuid)', 'drop_dead_push_tokens(text[])'] LOOP
    EXECUTE format('ALTER FUNCTION xtrud_api.%s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION xtrud_api.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION xtrud_api.%s TO xtrud_api', f);
  END LOOP;
END $$;

COMMIT;
