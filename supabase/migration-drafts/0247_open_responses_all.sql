-- 0247: откликаться на задания может каждый (№325, 2026-10-08).
--
-- Владелец, 2026-10-08: «стоит ограничение, что откликнуться на большинство
-- категорий может только тот, у кого „Я специалист“ заполнен его категорией.
-- Убери, чтобы каждый мог откликаться».
--
-- Было (FACT, живой снимок 2026-10-08): categories_l2.open_responses = true
--   у 11 из 77 подкатегорий (уборка, переезды, подработка…), DEFAULT false;
--   respond_block_category / can_respond_to_order (0217) пускают в остальные
--   только специалиста с этой категорией.
-- Стало: open_responses = true у всех, DEFAULT true — новые подкатегории
--   тоже открыты. Функции не меняются: переключатель «Откликаться могут все»
--   в админке (category_open_responses) остаётся — закрыть категорию можно.
--
-- Откат: 0247_open_responses_all_rollback.sql (возвращает прежние 11).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0247_must_run_as_postgres';
  END IF;
  IF (SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'categories_l2'
         AND column_name = 'open_responses') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION '0247_default_changed';
  END IF;
END;
$$;

ALTER TABLE public.categories_l2 ALTER COLUMN open_responses SET DEFAULT true;
UPDATE public.categories_l2 SET open_responses = true WHERE NOT open_responses;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories_l2 WHERE NOT open_responses) THEN
    RAISE EXCEPTION '0247_not_all_open';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
