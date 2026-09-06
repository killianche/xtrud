-- 0165: notify_user шлёт в Edge Runtime на Beget (внутренний адрес шлюза api-gw),
-- а не в старый облачный проект Supabase. DECISION владельца 2026-09-06:
-- Supabase Cloud не используем, всё на Beget. Тело функции без изменений.

CREATE OR REPLACE FUNCTION public.notify_user(p_user_id uuid, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_secret text;
  v_url text := 'http://api-gw:8000/functions/v1/notify';
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
$function$

;
