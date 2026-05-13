-- Migration 0027 — починка `notify_user` под актуальный pg_net API.
--
-- Обнаружено при smoke-тесте триггера 0026 (Sprint B): любой INSERT в
-- `order_responses` валился с ошибкой "function extensions.http_post(...)
-- does not exist". Причина: миграция 0018 (Sprint 8.6) написана под pg_net
-- старой версии, где функция жила в схеме `extensions` и принимала
-- (url, body, headers). Текущая версия pg_net 0.20 использует
-- `net.http_post(url, body, params, headers, timeout_milliseconds)` —
-- другая схема + дополнительные параметры.
--
-- Side effect старого бага: ВСЕ push-уведомления на проде сейчас немы
-- (новый отклик, accept, message — каждое падало с ошибкой, но молчаливо
-- благодаря EXCEPTION-handler ... wait, его не было — старая версия валила
-- INSERT. Видимо клиентские мутации тоже валились в проде с этой ошибкой,
-- просто никто не дёргал данные операции на живых юзерах). Sprint 26
-- выявил это при первом же DB-уровне smoke.
--
-- Новая версия:
--  - схема: `net` (не `extensions`)
--  - сигнатура: с params (пустой) + timeout 2000ms
--  - обёрнуто в BEGIN/EXCEPTION WHEN OTHERS — push не должен валить
--    бизнес-транзакцию пользователя ни при каких условиях.

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_title   text,
  p_body    text,
  p_data    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, vault, pg_temp
AS $$
DECLARE
  v_secret  text;
  v_url     text := 'https://wgeimsajvjkzrrnfrnkb.supabase.co/functions/v1/notify';
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_user: notify_secret missing from vault';
    RETURN;
  END IF;

  -- Async POST через pg_net. Возвращает request_id (bigint), не используем.
  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
        'user_id', p_user_id,
        'title',   p_title,
        'body',    p_body,
        'data',    COALESCE(p_data, '{}'::jsonb)
      ),
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-notify-secret', v_secret
      ),
      timeout_milliseconds := 2000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Push — best effort. Не валим бизнес-транзакцию из-за infra-проблем.
    RAISE WARNING 'notify_user: http_post failed: %', SQLERRM;
  END;
END;
$$;

COMMENT ON FUNCTION public.notify_user IS
  'Sprint 27: pg_net 0.20 API + EXCEPTION handler. Шлёт push через edge function notify асинхронно. Молча проглатывает любые ошибки чтобы не валить пользовательскую транзакцию.';
