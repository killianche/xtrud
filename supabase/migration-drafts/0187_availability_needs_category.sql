-- 0187 — «Принимаю заказы» только у тех, кто в списке специалистов.
--
-- ЗАЧЕМ (FACT, 2026-09-11). Владелец зарегистрировал новый аккаунт: статус
-- «Нет категории», в каталоге его нет, но «Принимаю заказы → сегодня»
-- включилось. set_availability проверял только наличие профиля, а профиль
-- с 0186 есть у каждого. Сейчас у 1 из 4 профилей без категории стоит
-- «сегодня».
--
-- DECISION владельца (2026-09-11): специалист — каждый, но в списке
-- специалистов и в том, что к нему относится, — только с категорией.
-- Отклики к этому не относятся: откликаться можно и без категории.

BEGIN;

-- 1. Без категории можно только «не принимаю» и сброс.
CREATE OR REPLACE FUNCTION public.set_availability(p_status availability_status)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_until timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'Только мастер может ставить статус доступности';
  END IF;
  IF p_status NOT IN ('unavailable', 'unspecified')
     AND NOT EXISTS (SELECT 1 FROM public.master_categories WHERE master_id = v_user_id) THEN
    RAISE EXCEPTION 'Сначала выберите категорию: «Принимаю заказы» видно только в списке специалистов.'
      USING ERRCODE = 'P0001', DETAIL = 'category_required';
  END IF;
  v_until := public._availability_expires_at(p_status);
  UPDATE public.master_profiles
  SET availability_status = p_status,
      availability_until = v_until,
      updated_at = now()
  WHERE user_id = v_user_id;
  RETURN v_until;
END;
$$;

-- 2. Категорий не осталось — профиль уходит из каталога, и «Принимаю
--    заказы» вместе с ним: иначе при возврате категории всплыл бы старый
--    «сегодня» недельной давности.
CREATE OR REPLACE FUNCTION public.try_publish_master(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_category_count int;
  v_should_be_visible boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_category_count
  FROM public.master_categories WHERE master_id = p_user_id;

  v_should_be_visible := v_category_count >= 1;

  UPDATE public.master_profiles
  SET status = CASE WHEN v_should_be_visible THEN 'active'::master_status ELSE 'pending'::master_status END,
      is_hidden_from_search = NOT v_should_be_visible,
      updated_at = now()
  WHERE user_id = p_user_id
    AND status NOT IN ('suspended', 'archived')
    AND (status IS DISTINCT FROM (CASE WHEN v_should_be_visible THEN 'active'::master_status ELSE 'pending'::master_status END)
         OR is_hidden_from_search IS DISTINCT FROM (NOT v_should_be_visible));

  IF NOT v_should_be_visible THEN
    UPDATE public.master_profiles
       SET availability_status = 'unspecified',
           availability_until = NULL,
           updated_at = now()
     WHERE user_id = p_user_id
       AND availability_status <> 'unspecified';
  END IF;
END;
$$;

-- 3. Уже включённое без категории — сбросить.
UPDATE public.master_profiles mp
   SET availability_status = 'unspecified',
       availability_until = NULL,
       updated_at = now()
 WHERE mp.availability_status <> 'unspecified'
   AND NOT EXISTS (SELECT 1 FROM public.master_categories mc WHERE mc.master_id = mp.user_id);

COMMIT;
