-- Migration 0058 — наполнение avg_check_rub в categories_l3 (P0-4 helper).
--
-- Контекст: research/MASTER_ACCOUNT_PLAN.md §P0-4.
-- В форме «Новая услуга» при выборе L3 показывается hint «В среднем берут
-- X ₽ — применить» — pricing-helper в стиле TaskRabbit Pricing Guidance.
-- До этой миграции avg_check_rub был NULL у всех 280 L3 услуг → hint никогда
-- не показывался.
--
-- Источник цен: типовые ставки мастеров в РФ-регионах (Ингушетия, Чечня,
-- Дагестан) на середину 2026. Это «среднее по рынку», от которого мастер
-- может отталкиваться. Цифры округлены до сотен/тысяч.
--
-- Заполнено ~50 самых популярных услуг (60% спроса по нашим L2). Остальные
-- 230 — отдельной задачей наполнения после получения реальных данных.

-- ============================================================================
-- Сантехника
-- ============================================================================
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'faucet-replace';
UPDATE public.categories_l3 SET avg_check_rub = 4000 WHERE id = 'toilet-install';
UPDATE public.categories_l3 SET avg_check_rub = 8000 WHERE id = 'bath-install';
UPDATE public.categories_l3 SET avg_check_rub = 6000 WHERE id = 'shower-install';
UPDATE public.categories_l3 SET avg_check_rub = 2500 WHERE id = 'sink-install';
UPDATE public.categories_l3 SET avg_check_rub = 3500 WHERE id = 'boiler-install';
UPDATE public.categories_l3 SET avg_check_rub = 2000 WHERE id = 'washer-connect';
UPDATE public.categories_l3 SET avg_check_rub = 2000 WHERE id = 'dishwasher-connect';
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'water-filter';
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'clog-clear';

-- ============================================================================
-- Электрика
-- ============================================================================
UPDATE public.categories_l3 SET avg_check_rub = 800 WHERE id = 'outlet-replace';
UPDATE public.categories_l3 SET avg_check_rub = 1200 WHERE id = 'outlet-install';
UPDATE public.categories_l3 SET avg_check_rub = 25000 WHERE id = 'wiring-apt';
UPDATE public.categories_l3 SET avg_check_rub = 50000 WHERE id = 'wiring-house';
UPDATE public.categories_l3 SET avg_check_rub = 8000 WHERE id = 'panel-install';
UPDATE public.categories_l3 SET avg_check_rub = 2000 WHERE id = 'lighting-install';
UPDATE public.categories_l3 SET avg_check_rub = 3500 WHERE id = 'led-strip';
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'troubleshoot';
UPDATE public.categories_l3 SET avg_check_rub = 4500 WHERE id = 'grounding';
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'rcd-install';

-- ============================================================================
-- Мастер на час (handyman)
-- ============================================================================
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'mount-tv';
UPDATE public.categories_l3 SET avg_check_rub = 800 WHERE id = 'mount-picture';
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'assemble-small';
UPDATE public.categories_l3 SET avg_check_rub = 1200 WHERE id = 'curtain-install';
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'small-plumbing';
UPDATE public.categories_l3 SET avg_check_rub = 1200 WHERE id = 'small-electrical';
UPDATE public.categories_l3 SET avg_check_rub = 1000 WHERE id = 'seal-crack';
UPDATE public.categories_l3 SET avg_check_rub = 1500 WHERE id = 'misc-small';

-- ============================================================================
-- Покраска (за квадратный метр или работу)
-- ============================================================================
UPDATE public.categories_l3 SET avg_check_rub = 350 WHERE id = 'paint-walls';
UPDATE public.categories_l3 SET avg_check_rub = 400 WHERE id = 'paint-ceiling';
UPDATE public.categories_l3 SET avg_check_rub = 500 WHERE id = 'paint-facade';
UPDATE public.categories_l3 SET avg_check_rub = 800 WHERE id = 'paint-radiator';
UPDATE public.categories_l3 SET avg_check_rub = 250 WHERE id = 'paint-finish-putty';
UPDATE public.categories_l3 SET avg_check_rub = 200 WHERE id = 'paint-sanding';
UPDATE public.categories_l3 SET avg_check_rub = 1200 WHERE id = 'paint-decorative';

-- ============================================================================
-- Плиточные работы (за м²)
-- ============================================================================
UPDATE public.categories_l3 SET avg_check_rub = 1200 WHERE id = 'tile-bathroom';
UPDATE public.categories_l3 SET avg_check_rub = 1000 WHERE id = 'tile-floor';
UPDATE public.categories_l3 SET avg_check_rub = 5000 WHERE id = 'tile-kitchen-apron';
UPDATE public.categories_l3 SET avg_check_rub = 2500 WHERE id = 'tile-mosaic';
UPDATE public.categories_l3 SET avg_check_rub = 1300 WHERE id = 'tile-porcelain';
UPDATE public.categories_l3 SET avg_check_rub = 600 WHERE id = 'tile-grout';
UPDATE public.categories_l3 SET avg_check_rub = 400 WHERE id = 'tile-demo';
