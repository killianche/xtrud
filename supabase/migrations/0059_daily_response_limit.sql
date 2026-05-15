-- Migration 0059 — daily response limit для мастера (P0-5).
--
-- Контекст: research/MASTER_ACCOUNT_PLAN.md §P0-5. Эталон — Яндекс Услуги
-- (7 откликов/день в free-tier). Для нас 5/день — достаточно для активного
-- мастера, защищает каталог от спам-мастеров.
--
-- Архитектура: считаем откликом любой INSERT в order_responses за сегодня
-- (date_trunc('day', created_at) = today). Без отдельной таблицы счётчика —
-- COUNT(*) на индексе master_id+created_at достаточно для 5/день нагрузки.
--
-- Что делаем:
--   1. Константа лимита (через GUC или просто хардкод в trigger/RPC).
--   2. Trigger BEFORE INSERT order_responses → блокирует при достижении
--      лимита с понятным error code.
--   3. RPC get_response_limit_today(p_master_id) → JSON {used, max, remaining}.
--      Доступен authenticated, читает только свой счётчик (RLS-style).
--
-- Будущая монетизация: лимит можно поднимать по user_id или роли (когда будем
-- продавать «больше откликов за деньги», как Яндекс 199 ₽/нед безлимит).

-- ============================================================================
-- TRIGGER: лимит на INSERT в order_responses
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_daily_response_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
  v_limit int := 5;
BEGIN
  -- Счётчик откликов мастера за сегодня (UTC — для региона UTC+3 будет
  -- сдвиг до 3 часов утра по Москве, что приемлемо. Если станет важно —
  -- использовать `created_at AT TIME ZONE 'Europe/Moscow'`).
  SELECT count(*) INTO v_count
  FROM public.order_responses
  WHERE master_id = NEW.master_id
    AND created_at::date = (now() AT TIME ZONE 'Europe/Moscow')::date;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'daily_response_limit_reached' USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_daily_response_limit IS
  'Trigger: блокирует INSERT в order_responses если у мастера уже 5 откликов за сегодня (МСК-сутки). P0-5.';

REVOKE EXECUTE ON FUNCTION public.check_daily_response_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_daily_response_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_daily_response_limit() FROM authenticated;

CREATE TRIGGER order_responses_daily_limit
BEFORE INSERT ON public.order_responses
FOR EACH ROW
EXECUTE FUNCTION public.check_daily_response_limit();

-- ============================================================================
-- RPC: get_response_limit_today
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_response_limit_today()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    AND created_at::date = (now() AT TIME ZONE 'Europe/Moscow')::date;

  RETURN jsonb_build_object(
    'used', v_count,
    'max', v_limit,
    'remaining', GREATEST(0, v_limit - v_count)
  );
END;
$$;

COMMENT ON FUNCTION public.get_response_limit_today IS
  'Возвращает JSON {used, max, remaining} с текущим лимитом откликов мастера за сегодня. P0-5.';

GRANT EXECUTE ON FUNCTION public.get_response_limit_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_response_limit_today() TO anon;
