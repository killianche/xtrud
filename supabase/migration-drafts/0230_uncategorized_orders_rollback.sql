-- Откат 0230: убираются три админ-RPC, слаг-функция, шесть триггеров,
-- журнал событий заглушки и служебная категория 'uncategorized'.
--
-- Останавливается, если на заглушку ещё ссылаются задания, отклики или
-- отзывы (FK RESTRICT): сначала admin_set_order_category каждому заданию из
-- admin_list_uncategorized_orders. Задания молча в другую категорию откат
-- не переносит — это решение владельца, а не SQL.
--
-- Не откатывается (намеренно):
--   * ограничение admin_actions_action_check остаётся в редакции 0230:
--     журнал append-only (триггеры admin_actions_no_delete / _no_update),
--     записи order_set_category / category_create удалить нельзя, и
--     прежнее ограничение на них не встанет. Лишние значения в списке
--     безвредны — функций, которые их пишут, после отката нет;
--   * категории, созданные через admin_create_category, и их слова поиска:
--     это уже рабочие данные (на них ссылаются задания и профили).
--
-- Клиент, публикующий в 'uncategorized', после отката получит ошибку FK:
-- откатывать только вместе с выключением этого пути в приложении.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0230_rollback_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE l2_id = 'uncategorized')
     OR EXISTS (SELECT 1 FROM public.order_responses WHERE l2_id = 'uncategorized')
     OR EXISTS (SELECT 1 FROM public.reviews WHERE l2_id = 'uncategorized') THEN
    RAISE EXCEPTION '0230_rollback_stub_in_use'
      USING HINT = 'Назначьте категории заданиям из admin_list_uncategorized_orders; отклики и отзывы — UPDATE l2_id вручную.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.admin_list_uncategorized_orders(integer);
DROP FUNCTION IF EXISTS public.admin_set_order_category(uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_create_category(text, text, text, text[]);
DROP FUNCTION IF EXISTS xtrud_private.category_slug(text);

DROP TRIGGER IF EXISTS orders_uncategorized_events ON public.orders;
DROP TRIGGER IF EXISTS orders_uncategorized_extras ON public.orders;
DROP TRIGGER IF EXISTS master_categories_no_service_category ON public.master_categories;
DROP TRIGGER IF EXISTS master_services_no_service_category ON public.master_services;
DROP TRIGGER IF EXISTS category_terms_no_service_category ON public.category_terms;
DROP TRIGGER IF EXISTS categories_l2_guard_service_category ON public.categories_l2;

DROP FUNCTION IF EXISTS xtrud_private.orders_uncategorized_events();
DROP FUNCTION IF EXISTS xtrud_private.orders_uncategorized_extras();
DROP FUNCTION IF EXISTS xtrud_private.master_categories_no_service_category();
DROP FUNCTION IF EXISTS xtrud_private.category_terms_no_service_category();
DROP FUNCTION IF EXISTS xtrud_private.categories_l2_guard_service_category();

DROP TABLE IF EXISTS xtrud_private.order_uncategorized_events;

-- Слов поиска и специалистов у заглушки не бывает (триггеры 0230), но
-- master_services ссылается с SET NULL, category_terms — CASCADE.
DELETE FROM public.categories_l2 WHERE id = 'uncategorized';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'uncategorized')
     OR to_regprocedure('public.admin_set_order_category(uuid,text,text)') IS NOT NULL
     OR to_regclass('xtrud_private.order_uncategorized_events') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname IN ('orders_uncategorized_extras', 'orders_uncategorized_events',
                                  'master_categories_no_service_category',
                                  'master_services_no_service_category',
                                  'categories_l2_guard_service_category',
                                  'category_terms_no_service_category')) THEN
    RAISE EXCEPTION '0230_rollback_incomplete';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
