-- 0194: «Вывоз мусора» и «Разнорабочие» (владелец, 2026-09-13).
--
-- «Утилизация и вывоз» люди не узнают — называют это «вывоз мусора».
-- «Разнорабочие» заказывают часто, а своей категории не было: такие задания
-- уходили в «Мастер на час» или «Другое». Ставим рядом с «Мастером на час».
-- Иконка HardHat уже есть в src/lib/category-icons.ts.
-- Применено на Beget 2026-09-13; после — npm run catalog:generate.

BEGIN;

UPDATE public.categories_l2 SET name_ru = 'Вывоз мусора' WHERE id = 'disposal';

INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_active, is_visible, is_featured)
VALUES ('laborers', 'handyman-moving', 'Разнорабочие', 'HardHat', 60, true, true, false)
ON CONFLICT (id) DO UPDATE
  SET l1_id = EXCLUDED.l1_id, name_ru = EXCLUDED.name_ru, icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order, is_active = true, is_visible = true;

INSERT INTO public.categories_l3 (id, l2_id, name_ru, urgency_typical, sort_order) VALUES
  ('laborer-day',        'laborers', 'Разнорабочий на день',           'urgent', 10),
  ('laborer-hour',       'laborers', 'Разнорабочий на час',            'urgent', 20),
  ('laborer-loading',    'laborers', 'Погрузка и разгрузка',           'urgent', 30),
  ('laborer-demolition', 'laborers', 'Демонтаж и расчистка',           'week',   40),
  ('laborer-earthworks', 'laborers', 'Земляные работы',                'week',   50),
  ('laborer-site-help',  'laborers', 'Подсобные работы на стройке',    'week',   60)
ON CONFLICT (id) DO NOTHING;

-- Слова поиска: как люди пишут это сами.
INSERT INTO public.category_terms (l2_id, term, weight)
SELECT v.l2_id, v.term, v.weight
  FROM (VALUES
    ('laborers', 'разнорабочий', 100), ('laborers', 'разнорабочие', 100),
    ('laborers', 'подсобник', 90), ('laborers', 'подсобный рабочий', 90),
    ('laborers', 'чернорабочий', 90), ('laborers', 'рабочие на день', 80),
    ('laborers', 'помощник', 60),
    ('disposal', 'вывоз мусора', 100), ('disposal', 'мусор', 90),
    ('disposal', 'утилизация', 70)
  ) AS v(l2_id, term, weight)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.category_terms t
    WHERE t.l2_id = v.l2_id AND lower(t.term) = lower(v.term));

COMMIT;
