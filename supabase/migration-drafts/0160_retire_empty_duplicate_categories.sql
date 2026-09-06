-- 0160 — две пустые категории-дубликата выключены.
--
-- DECISION владельца 2026-09-06: «„Бытовая техника“, „Спутник, ТВ и интернет“ —
-- почему бы не открыть? Открой, если хочешь». Решение отдано мне — принимаю
-- по данным, а не по настроению (FACT, live 2026-09-06):
--
--   appliances  «Бытовая техника»          услуг 0, мастеров 0
--   tv-internet «Спутник, ТВ и интернет»    услуг 0, мастеров 0
--   appliance-repair «Ремонт бытовой техники»   услуг 15  (видима)
--   satellite-tv     «Спутниковое ТВ и антенны»  услуг 6   (видима)
--
-- Обе скрытые лежат в том же разделе «Техника и безопасность», что и их
-- видимые двойники. Открыть их — показать рядом с «Ремонтом бытовой техники»
-- пустую «Бытовую технику», в которой нечего выбрать. Это два одинаковых
-- пункта и тупик за одним из них — дефект по design-quality §1.1.
--
-- Поэтому не открываем, а выключаем (is_active = false), чтобы вопрос не
-- возвращался: выключенная категория не попадает ни в каталог, ни в бандл.
-- Обратимо одной строкой: UPDATE categories_l2 SET is_active = true, ...
-- Задания/мастера на эти категории не ссылаются (проверено: 0 и 0).

BEGIN;

UPDATE public.categories_l2
   SET is_visible = false, is_active = false
 WHERE id IN ('appliances', 'tv-internet');

DO $$
DECLARE v_refs int;
BEGIN
  SELECT count(*) INTO v_refs FROM public.orders WHERE l2_id IN ('appliances', 'tv-internet');
  IF v_refs > 0 THEN RAISE EXCEPTION 'retire_categories_have_orders: %', v_refs; END IF;
  SELECT count(*) INTO v_refs FROM public.master_categories WHERE l2_id IN ('appliances', 'tv-internet');
  IF v_refs > 0 THEN RAISE EXCEPTION 'retire_categories_have_masters: %', v_refs; END IF;
END $$;

COMMIT;
