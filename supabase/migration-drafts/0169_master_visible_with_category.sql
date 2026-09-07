-- 0169: специалист виден в каталоге, как только выбрал хотя бы одну категорию.
--
-- DECISION владельца 2026-05-20 (docs, MasterPublishChecklist): «профиль виден
-- сразу, чек-лист — только подсказка». FACT (live, 2026-09-07): функция
-- try_publish_master по-прежнему требовала 5 фото портфолио и опыт > 0 и
-- прятала профиль (status = pending, is_hidden_from_search = true) — поэтому в
-- каталоге было 0 специалистов. DECISION владельца 2026-09-07: профиль
-- специалиста — категории, о себе, фото, контакты; «и всё».
--
-- Правило теперь: хотя бы одна категория → active и виден. Триггеры
-- _trg_categories_publish_check / _trg_portfolio_publish_check /
-- _trg_profile_experience_check зовут эту функцию сами.

CREATE OR REPLACE FUNCTION public.try_publish_master(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
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
END;
$$;

-- Пересчитать существующие профили по новому правилу.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.master_profiles LOOP
    PERFORM public.try_publish_master(r.user_id);
  END LOOP;
END $$;
