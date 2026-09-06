-- 0162 — дневной лимит откликов читает только сегодняшние строки; политика
-- чтения откликов без вложенного RLS.
--
-- DECISION владельца 2026-09-06: приложение не должно тормозить при росте
-- данных. Разбор (техническая роль, FACT по pg_proc/pg_policies):
--
-- 1. check_daily_response_limit (триггер на каждый INSERT отклика) и
--    get_response_limit_today (RPC на каждый заход мастера) фильтровали
--    `created_at::date = <сегодня>`. Приведение к дате делает условие
--    неиндексируемым: читались ВСЕ отклики мастера за всё время (до ~1800 в
--    год при лимите 5/день) ради счёта сегодняшних. Переписано в диапазон —
--    его берёт индекс order_responses_master_created_idx из 0161. Смысл
--    («сутки по Москве») сохранён.
-- 2. Политика order_responses_read_participants делала inline-подзапрос по
--    orders — на каждую строку отклика запускался RLS таблицы orders целиком.
--    Заменён на существующий SECURITY DEFINER-хелпер xtrud_private.order_client_id
--    (FACT: возвращает uuid, secdef=true). Смысл политики не меняется:
--    отклик видят его автор и владелец задания.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_daily_response_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_count int;
  v_limit int := 5;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Europe/Moscow')) AT TIME ZONE 'Europe/Moscow';
BEGIN
  SELECT count(*) INTO v_count
  FROM public.order_responses
  WHERE master_id = NEW.master_id
    AND status <> 'withdrawn'
    AND created_at >= v_day_start
    AND created_at <  v_day_start + interval '1 day';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'daily_response_limit_reached' USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_response_limit_today()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid;
  v_count int;
  v_limit int := 5;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Europe/Moscow')) AT TIME ZONE 'Europe/Moscow';
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'max', v_limit, 'remaining', v_limit);
  END IF;

  SELECT count(*) INTO v_count
  FROM public.order_responses
  WHERE master_id = v_user_id
    AND status <> 'withdrawn'
    AND created_at >= v_day_start
    AND created_at <  v_day_start + interval '1 day';

  RETURN jsonb_build_object(
    'used', v_count,
    'max', v_limit,
    'remaining', GREATEST(0, v_limit - v_count)
  );
END;
$$;

DROP POLICY IF EXISTS order_responses_read_participants ON public.order_responses;
CREATE POLICY order_responses_read_participants ON public.order_responses
  FOR SELECT TO public
  USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) = xtrud_private.order_client_id(order_id)
  );

-- Проверка: новый предикат в обеих функциях, политика на месте.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('check_daily_response_limit','get_response_limit_today') AND prosrc LIKE '%v_day_start + interval%') <> 2 THEN
    RAISE EXCEPTION 'daily_limit_predicate_not_applied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_responses' AND policyname='order_responses_read_participants' AND qual LIKE '%order_client_id%') THEN
    RAISE EXCEPTION 'responses_policy_not_applied';
  END IF;
END $$;

COMMIT;
