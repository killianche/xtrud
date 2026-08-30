-- 0111_response_limit_excludes_withdrawn.sql
--
-- Дневной лимит откликов (5/день) больше не «съедает» слот, если мастер сам
-- отозвал отклик. Решение владельца 2026-05-28: отзыв возвращает слот.
--
-- Раньше обе функции считали ВСЕ отклики мастера за день, включая withdrawn,
-- поэтому отозванный отклик неожиданно отнимал попытку. Добавлен фильтр
-- status <> 'withdrawn'. Отклонённый клиентом отклик (rejected) по-прежнему
-- считается — мастер реально откликнулся, клиент лишь скрыл отклик.
--
-- Применено к prod через MCP apply_migration (response_limit_excludes_withdrawn).

CREATE OR REPLACE FUNCTION public.get_response_limit_today()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_count int;
  v_limit int := 5;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'max', v_limit, 'remaining', v_limit);
  END IF;

  SELECT count(*) INTO v_count
  FROM public.order_responses
  WHERE master_id = v_user_id
    AND status <> 'withdrawn'
    AND created_at::date = (now() AT TIME ZONE 'Europe/Moscow')::date;

  RETURN jsonb_build_object(
    'used', v_count,
    'max', v_limit,
    'remaining', GREATEST(0, v_limit - v_count)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_daily_response_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count int;
  v_limit int := 5;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.order_responses
  WHERE master_id = NEW.master_id
    AND status <> 'withdrawn'
    AND created_at::date = (now() AT TIME ZONE 'Europe/Moscow')::date;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'daily_response_limit_reached' USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
