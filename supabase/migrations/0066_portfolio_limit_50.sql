-- 0066_portfolio_limit_50 — поднимаем лимит портфолио 12 → 50.
--
-- Why. Изначально 12 (Profi.ru-стандарт) — но для отделочников / спецтехники
-- / ландшафтных дизайнеров портфолио из 30-50 фото даёт лучшую конверсию.
-- Фидбэк user 2026-05-15: «добавлять до 50 фотографий».
--
-- Compression на клиенте (resize 1920 + JPEG 0.82) даёт ~100 KB/фото,
-- 50×100 KB = ~5 MB на портфолио — приемлемо для Storage квоты.
--
-- См. также src/features/profile/use-my-portfolio.ts:PORTFOLIO_MAX = 50.

CREATE OR REPLACE FUNCTION public.check_portfolio_items_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.portfolio_items
  WHERE master_id = NEW.master_id;

  IF v_count >= 50 THEN
    RAISE EXCEPTION 'max_50_portfolio_items_per_master' USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_portfolio_items_limit IS
  'Trigger function: лимит 50 портфолио-фото на мастера (был 12 до 0066).';

REVOKE EXECUTE ON FUNCTION public.check_portfolio_items_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_portfolio_items_limit() FROM anon;
