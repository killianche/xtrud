-- 0171: чистка каталога по разбору продуктовой роли (2026-09-07).
--
-- DECISION владельца: «проверить, соответствует ли количество категорий,
-- услуг и подкатегорий тому, что нужно». FACT (live): 7 разделов, 50 категорий,
-- 332 услуги, 0 специалистов. Дубли и ошибки размещения ниже — из живой базы.
-- Ссылок на услуги нет (orders.l3_ids и master_services.l3_id пусты), поэтому
-- дубли выключаются (is_active = false), а не удаляются.

-- 1. Межкатегорийные дубли по названию: остаётся одна услуга в профильной ветке.
UPDATE public.categories_l3 SET is_active = false WHERE id IN (
  'paint-facade',        -- «Покраска фасада» остаётся в facade (facade-paint)
  'insul-roof',          -- «Утепление кровли» остаётся в roofing (roof-insulation)
  'insul-facade'         -- «Утепление фасада» остаётся в facade (facade-insulation)
);

-- 2. Внутрикатегорийные дубли.
UPDATE public.categories_l3 SET is_active = false WHERE id IN (
  'tv-mount', 'curtain-mount', 'assemble-small',          -- handyman
  'washing-machine-repair', 'fridge-repair', 'dishwasher-repair', -- appliance-repair
  'lock-open'                                              -- locks-security (остаётся lock-emergency)
);
UPDATE public.categories_l3 SET name_ru = 'Аварийное вскрытие замка' WHERE id = 'lock-emergency';
-- Видеонаблюдение/сигнализация/домофон живут в security-systems — в замках это дубли.
UPDATE public.categories_l3 SET is_active = false WHERE id IN ('cctv-install', 'alarm-install', 'intercom')
  AND EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'security-systems' AND is_active);

-- 3. «Прочее» без единой услуги — тупик в выборе: скрыть.
UPDATE public.categories_l2 SET is_active = false, is_visible = false WHERE id = 'other';

-- 4. Кондиционеры и вентиляция — своя категория (сезонный спрос), а не «ремонт техники».
INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_active, is_visible)
VALUES ('climate-control', 'utilities', 'Кондиционеры и вентиляция', 'Wind', 175, true, true)
ON CONFLICT (id) DO NOTHING;
UPDATE public.categories_l3 SET l2_id = 'climate-control' WHERE id IN ('ac-install', 'ac-service', 'ac-uninstall', 'ventilation');
UPDATE public.categories_l3 SET is_active = false WHERE id = 'appl-ac'; -- дубль «Кондиционер» в ремонте техники
UPDATE public.categories_l2 SET name_ru = 'Отопление и котлы' WHERE id = 'climate';

-- 5. Спецтехника — крупнейший пробел стройки.
INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_active, is_visible)
VALUES ('machinery', 'construction', 'Спецтехника', 'Truck', 235, true, true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.categories_l3 (id, l2_id, name_ru, sort_order, is_active) VALUES
  ('excavator', 'machinery', 'Экскаватор / погрузчик', 10, true),
  ('manipulator', 'machinery', 'Манипулятор', 20, true),
  ('dump-truck', 'machinery', 'Самосвал', 30, true),
  ('aerial-platform', 'machinery', 'Автовышка', 40, true),
  ('auger-drill', 'machinery', 'Ямобур', 50, true),
  ('concrete-mixer', 'machinery', 'Миксер / бетононасос', 60, true)
ON CONFLICT (id) DO NOTHING;

-- 6. Доставка стройматериалов — категория есть, услуг не было.
INSERT INTO public.categories_l3 (id, l2_id, name_ru, sort_order, is_active) VALUES
  ('delivery-bulk', 'materials-delivery', 'Песок, щебень, гравий', 10, true),
  ('delivery-blocks', 'materials-delivery', 'Кирпич и блоки', 20, true),
  ('delivery-cement', 'materials-delivery', 'Цемент и сухие смеси', 30, true),
  ('delivery-lumber', 'materials-delivery', 'Пиломатериалы', 40, true),
  ('delivery-mixed', 'materials-delivery', 'Доставка со склада / магазина', 50, true)
ON CONFLICT (id) DO NOTHING;
UPDATE public.categories_l2 SET is_active = true, is_visible = true WHERE id = 'materials-delivery';

-- 7. Септик ставим — обслуживать некому.
INSERT INTO public.categories_l3 (id, l2_id, name_ru, sort_order, is_active) VALUES
  ('septic-pumping', 'water-sewer', 'Откачка септика / ассенизатор', 55, true)
ON CONFLICT (id) DO NOTHING;
