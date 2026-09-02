-- Удаление «Сохранённых мастеров» целиком.
--
-- DECISION владельца 2026-09-02. Функция была сломана как продукт: кнопка
-- «В закладки» на карточке мастера писала в user_favorites, а экран со
-- списком был недостижим — ни один переход на него не вёл. Сохранять можно,
-- посмотреть некуда. Владелец выбрал удалить, а не чинить.
--
-- ПОРЯДОК ПРИМЕНЕНИЯ (docs/AGENT_WORKFLOW.md §4): сначала клиент без кнопки
-- (сборка 18), потом наблюдение, и только потом эта миграция. Пока в TestFlight
-- у друзей сборка 16 с кнопкой, удалять таблицу нельзя — их нажатие начнёт
-- падать. Живых данных: 1 строка на 2026-09-02.
--
-- Проверено на Beget: на таблицу нет внешних ключей, функций и триггеров.

BEGIN;

DROP POLICY IF EXISTS user_favorites_select_own ON public.user_favorites;
DROP POLICY IF EXISTS user_favorites_insert_own ON public.user_favorites;
DROP POLICY IF EXISTS user_favorites_delete_own ON public.user_favorites;

DROP TABLE IF EXISTS public.user_favorites;

DO $$
BEGIN
  IF to_regclass('public.user_favorites') IS NOT NULL THEN
    RAISE EXCEPTION 'user_favorites_still_present';
  END IF;
  RAISE NOTICE 'user_favorites удалена вместе с политиками.';
END
$$;

COMMIT;
