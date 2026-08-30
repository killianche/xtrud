-- 0043_availability_status.sql
--
-- Sprint J: статус готовности мастера (фидбэк юзера 2026-05-14:
-- «как в такси, мастер ставит онлайн чтобы клиент знал что он берёт заказ»).
--
-- 4 статуса: today / this_week / next_week / unavailable.
-- Авто-сброс по expiration:
--   today      → завтра 06:00
--   this_week  → конец текущей недели (воскр 23:59:59)
--   next_week  → конец следующей недели
--   unavailable → бессрочно
--
-- Cron expire_availability() запускается раз в час (pg_cron — TODO sprint 2).

DO $$ BEGIN
  CREATE TYPE public.availability_status AS ENUM ('today','this_week','next_week','unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.master_profiles
  ADD COLUMN IF NOT EXISTS availability_status public.availability_status NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS availability_until timestamptz;

COMMENT ON COLUMN public.master_profiles.availability_status IS
  'Текущий статус готовности взять заказ.';
COMMENT ON COLUMN public.master_profiles.availability_until IS
  'До какого момента активен статус. Авто-сбрасывается на unavailable когда истёк.';

-- Helper: вычислить expiration timestamp.
CREATE OR REPLACE FUNCTION public._availability_expires_at(p_status public.availability_status)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
    WHEN 'today'      THEN (now()::date + interval '1 day' + interval '6 hours')::timestamptz
    WHEN 'this_week'  THEN (date_trunc('week', now()) + interval '7 days' - interval '1 second')::timestamptz
    WHEN 'next_week'  THEN (date_trunc('week', now()) + interval '14 days' - interval '1 second')::timestamptz
    ELSE NULL
  END;
$$;

-- RPC: мастер устанавливает свой статус.
CREATE OR REPLACE FUNCTION public.set_availability(p_status public.availability_status)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_until timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'Только мастер может ставить статус доступности';
  END IF;
  v_until := public._availability_expires_at(p_status);
  UPDATE public.master_profiles
  SET availability_status = p_status,
      availability_until = v_until,
      updated_at = now()
  WHERE user_id = v_user_id;
  RETURN v_until;
END; $$;

REVOKE ALL ON FUNCTION public.set_availability(public.availability_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_availability(public.availability_status) TO authenticated;

-- RPC: cron-запускаемая очистка истёкших статусов.
CREATE OR REPLACE FUNCTION public.expire_availability()
RETURNS integer LANGUAGE sql AS $$
  WITH expired AS (
    UPDATE public.master_profiles
    SET availability_status = 'unavailable', availability_until = NULL, updated_at = now()
    WHERE availability_until IS NOT NULL AND availability_until < now()
    RETURNING 1
  )
  SELECT count(*)::int FROM expired;
$$;
