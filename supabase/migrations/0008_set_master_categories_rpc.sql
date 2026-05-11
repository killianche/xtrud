-- Migration 0008 — RPC set_master_categories для атомарной синхронизации
-- master_categories пользователя со списком L2-id'шников (diff: DELETE not-in + INSERT).
--
-- Используется на screen /(onboarding)/master-categories после изменений селекта.
-- SECURITY INVOKER — RLS на master_categories даёт нужные права (auth.uid() = master_id).

CREATE OR REPLACE FUNCTION public.set_master_categories(p_l2_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Проверка лимита 5 категорий. Триггер master_categories_max_5_per_master
  -- сработал бы при INSERT, но проверим заранее для понятной ошибки.
  IF array_length(p_l2_ids, 1) > 5 THEN
    RAISE EXCEPTION 'too_many_categories' USING errcode = 'P0001';
  END IF;

  -- DELETE категории, которых нет в новом списке
  DELETE FROM public.master_categories
  WHERE master_id = v_user_id
    AND l2_id != ALL(COALESCE(p_l2_ids, ARRAY[]::text[]));

  -- INSERT новых (дубликаты игнорируются)
  IF p_l2_ids IS NOT NULL AND array_length(p_l2_ids, 1) > 0 THEN
    INSERT INTO public.master_categories (master_id, l2_id)
    SELECT v_user_id, unnest(p_l2_ids)
    ON CONFLICT (master_id, l2_id) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_master_categories IS 'Атомарная синхронизация master_categories со списком L2-id. Удаляет not-in, добавляет новые. Использует auth.uid() для безопасности.';

-- GRANTS — открываем authenticated, закрываем anon
REVOKE EXECUTE ON FUNCTION public.set_master_categories(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_master_categories(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_master_categories(text[]) TO authenticated;
