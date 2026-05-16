-- 0082_walls_decor_taxonomy.sql
--
-- Расширение таксономии «отделка стен» — закрытие пропусков по фидбэку user
-- 2026-05-16 (запрос «обои» возвращал 0 результатов).
--
-- Что найдено:
--   1. L3 «Поклейка обоев» отсутствовала в БД полностью (была в
--      CATEGORIES_AND_PROFILES.md как `wallpaper`, миграция на неё не была сделана).
--   2. Synonym 'обои' висел на L2 `finishing` который is_visible=false.
--   3. L2 `plaster-putty` (Штукатурка и шпаклёвка) скрыт (is_active=false,
--      is_visible=false), но содержит 7 базовых L3 (машинная/ручная штукатурка,
--      шпаклёвка стен/потолка, выравнивание стен, штукатурка по маякам,
--      венецианская/декоративная) которые никак не видны пользователю.
--   4. UI поиска использовал client-side ILIKE, не RPC `search_categories`
--      (см. `.claude/rules/connect-the-dots.md`).
--
-- Что делает миграция:
--   1. **Переносит 7 L3 из deprecated `plaster-putty` в видимую `painting`** —
--      оживляет имеющиеся данные без потери ссылок (master_services
--      сохраняют связь через l3_id).
--      Заодно делаем plaster-venetian более конкретной: «Венецианская / декоративная»
--      → «Венецианская штукатурка» (а декоративная в целом покрывается paint-decorative).
--   2. INSERT 8 новых wallpaper-* L3 в `painting`.
--   3. INSERT 3 новых plaster-* L3 (koroed/silk/microcement) — venetian уже есть.
--   4. Перевязывает synonym 'обои' с `finishing` (скрытого) на `painting`.
--   5. Добавляет 23 новых synonyms в `category_terms`.
--
-- ⚠️ Сайд-эффект: после миграции в L2 `painting` будет ~26 L3 (7 покраски + 7
-- штукатурки/шпаклёвки + 8 обоев + 4 декоративных). Это много, но всё ещё
-- читаемый список с sort_order группировкой. Дальнейшее разбиение на отдельные
-- L2 (`wall-decor`, `wallpaper`) — отдельной задачей, требует icon-согласования.

BEGIN;

-- ============================================================================
-- 1. Перенос 7 L3 из `plaster-putty` в `painting`
-- ============================================================================
-- Sort order переназначаем чтобы они шли блоком ПЕРЕД обоями/декором.
-- Существующие paint-* имеют sort_order 10..70. Штукатурка/шпаклёвка — 200..299
-- (после декоративной штукатурки 160..190). Чисто визуально — сначала
-- покраска (готово), потом обои/декор (новое), потом база отделки (штукатурка).
--
-- Альтернатива: вставить штукатурку перед обоями (sort 5..) — но это сместит
-- семантический фокус painting на грязные работы. Оставляем painting →
-- покраска/декор сверху, базовые работы внизу.

UPDATE public.categories_l3 SET l2_id='painting', sort_order=200 WHERE id='plaster-machine';
UPDATE public.categories_l3 SET l2_id='painting', sort_order=210 WHERE id='plaster-manual';
UPDATE public.categories_l3 SET l2_id='painting', sort_order=220 WHERE id='plaster-beacons';
UPDATE public.categories_l3 SET l2_id='painting', sort_order=230 WHERE id='putty-walls';
UPDATE public.categories_l3 SET l2_id='painting', sort_order=240 WHERE id='putty-ceiling';
UPDATE public.categories_l3 SET l2_id='painting', sort_order=250 WHERE id='walls-level';
UPDATE public.categories_l3
SET l2_id='painting',
    name_ru='Венецианская штукатурка',
    sort_order=160
WHERE id='plaster-venetian';

-- ============================================================================
-- 2. INSERT 8 wallpaper-* L3
-- ============================================================================
INSERT INTO public.categories_l3
  (id, l2_id, name_ru, avg_check_rub, urgency_typical, seasonality, sort_order, is_active)
VALUES
  ('wallpaper-vinyl',     'painting', 'Поклейка виниловых обоев',     350, 'week', 'year_round',  80, true),
  ('wallpaper-fleece',    'painting', 'Поклейка флизелиновых обоев',  400, 'week', 'year_round',  90, true),
  ('wallpaper-paper',     'painting', 'Поклейка бумажных обоев',      250, 'week', 'year_round', 100, true),
  ('wallpaper-paintable', 'painting', 'Поклейка обоев под покраску',  300, 'week', 'year_round', 110, true),
  ('wallpaper-photo',     'painting', 'Поклейка фотообоев',           450, 'week', 'year_round', 120, true),
  ('wallpaper-liquid',    'painting', 'Нанесение жидких обоев',       600, 'week', 'year_round', 130, true),
  ('wallpaper-removal',   'painting', 'Удаление старых обоев',        150, 'week', 'year_round', 140, true),
  ('wallpaper-repair',    'painting', 'Ремонт обоев (стыки, пузыри)', 500, 'week', 'year_round', 150, true);

-- ============================================================================
-- 3. INSERT 3 plaster-* L3 (venetian уже перенесён выше с обновлённым именем)
-- ============================================================================
INSERT INTO public.categories_l3
  (id, l2_id, name_ru, avg_check_rub, urgency_typical, seasonality, sort_order, is_active)
VALUES
  ('plaster-koroed',      'painting', 'Штукатурка короед',            500, 'month', 'year_round', 170, true),
  ('plaster-silk',        'painting', 'Шёлковая штукатурка',         1200, 'month', 'year_round', 180, true),
  ('plaster-microcement', 'painting', 'Микроцемент / арт-бетон',     1800, 'month', 'year_round', 190, true);

-- ============================================================================
-- 4. Перевязка synonym 'обои' с скрытого `finishing` на видимый `painting`
-- ============================================================================
UPDATE public.category_terms
SET l2_id = 'painting'
WHERE term = 'обои' AND l2_id = 'finishing';

-- ============================================================================
-- 5. 23 новых synonyms
-- ============================================================================
INSERT INTO public.category_terms (l2_id, l3_id, term, weight)
VALUES
  ('painting', NULL, 'оклейка',                100),
  ('painting', NULL, 'поклеить обои',          100),
  ('painting', NULL, 'переклеить',             100),
  (NULL, 'wallpaper-fleece',    'флизелин',             100),
  (NULL, 'wallpaper-fleece',    'флизелиновые',         100),
  (NULL, 'wallpaper-vinyl',     'винил',                100),
  (NULL, 'wallpaper-vinyl',     'виниловые',            100),
  (NULL, 'wallpaper-paper',     'бумажные обои',        100),
  (NULL, 'wallpaper-photo',     'фотообои',             100),
  (NULL, 'wallpaper-liquid',    'жидкие обои',          100),
  (NULL, 'wallpaper-removal',   'снять обои',           100),
  (NULL, 'wallpaper-removal',   'удалить обои',         100),
  (NULL, 'wallpaper-removal',   'содрать обои',         100),
  (NULL, 'wallpaper-repair',    'ремонт обоев',         100),
  (NULL, 'paint-decorative',    'декоративная штукатурка', 100),
  (NULL, 'paint-decorative',    'декоратив',            100),
  (NULL, 'paint-decorative',    'фактурка',             100),
  (NULL, 'plaster-venetian',    'венецианка',           100),
  (NULL, 'plaster-venetian',    'венецианская',         100),
  (NULL, 'plaster-koroed',      'короед',               100),
  (NULL, 'plaster-silk',        'шёлковая штукатурка',  100),
  (NULL, 'plaster-microcement', 'микроцемент',          100),
  (NULL, 'plaster-microcement', 'арт-бетон',            100),
  (NULL, 'plaster-microcement', 'бетон-эффект',         100);

COMMIT;
