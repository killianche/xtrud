-- 0038_seed_master_categories_v2.sql
-- Sprint J — после миграции 0037 (новая таксономия 32 L2) большинство
-- видимых L2 не имели мастеров. По запросу пользователя — каждому
-- активному мастеру привязываем дополнительные случайные L2 чтобы
-- максимум 32 категории отображались с мастерами.
--
-- Тригер check_master_categories_limit() ограничивает 5 категорий на мастера,
-- поэтому добавляем только до достижения 5.
-- ON CONFLICT для defense — UNIQUE (master_id, l2_id) уже есть.

INSERT INTO public.master_categories (master_id, l2_id, l3_ids, category_bio, pricing_mode, category_radius_km)
SELECT
  mp.user_id,
  rnd.l2_id,
  ARRAY[]::text[],
  NULL,
  'on_quote'::master_pricing_mode,
  25
FROM public.master_profiles mp
CROSS JOIN LATERAL (
  SELECT l.id AS l2_id
  FROM public.categories_l2 l
  WHERE l.is_visible = true
    AND NOT EXISTS (
      SELECT 1 FROM public.master_categories mc
      WHERE mc.master_id = mp.user_id AND mc.l2_id = l.id
    )
  ORDER BY random()
  LIMIT GREATEST(0, 5 - (SELECT COUNT(*) FROM public.master_categories WHERE master_id = mp.user_id))
) rnd
WHERE mp.status = 'active';
