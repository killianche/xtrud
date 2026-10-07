-- Откат 0241 (№292, DECISION владельца 2026-10-07): каталог к состоянию до
-- 0241 — имена, порядок, l1_id appliance-repair, услуги и синонимы.
--
-- Удаляются строки, созданные 0241: раздел home-appliances, подкатегории
-- intercom-alarm / driver-hourly / roadside-help, их новые услуги и
-- синонимы. Удалить можно только пока на них нет ссылок (задания, категории
-- и услуги специалистов, отклики, отзывы, переадресации, подсказки
-- нейросети, статьи) и пока у новых подкатегорий нет чужих синонимов —
-- иначе откат останавливается (fail-closed), разбирать вручную.
-- Синонимы locks-security «видеонаблюдение» / «сигнализация» возвращаются
-- с прежними id и created_at; «домофон» / «сигнализация» security-systems —
-- те же строки (по id).
-- Правки админки над этими строками, сделанные после 0241, перезаписываются.
-- После отката: EXPO_PUBLIC_API_URL=https://api.xtrud.pro npm run
-- catalog:generate, затем npm run catalog:check.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0241_rollback_must_run_as_postgres';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories_l1 WHERE id = 'home-appliances')
     OR (SELECT count(*) FROM public.categories_l2
          WHERE id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')) <> 3 THEN
    RAISE EXCEPTION '0241_rollback_not_applied';
  END IF;
  -- В новом разделе — только appliance-repair.
  IF EXISTS (SELECT 1 FROM public.categories_l2
              WHERE l1_id = 'home-appliances' AND id <> 'appliance-repair') THEN
    RAISE EXCEPTION '0241_rollback_home_appliances_has_other_l2';
  END IF;
  -- В новых подкатегориях — только услуги 0241.
  IF EXISTS (SELECT 1 FROM public.categories_l3
              WHERE l2_id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')
                AND id NOT IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro',
                               'driver-own-car', 'driver-sober', 'driver-car-transfer',
                               'road-jumpstart', 'road-fuel', 'road-wheel'))
     OR (SELECT count(*) FROM public.categories_l3
          WHERE l2_id = 'intercom-alarm'
            AND id IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro')) <> 4 THEN
    RAISE EXCEPTION '0241_rollback_l3_state_changed';
  END IF;
  -- У новых подкатегорий — только синонимы 0241 (иначе CASCADE их молча удалит).
  IF EXISTS (SELECT 1 FROM public.category_terms t
              WHERE t.l2_id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')
                AND NOT (t.id IN ('c87c8500-d2c5-451f-b725-fd040f8953e6',
                                  '56188cdf-b692-4938-acee-dbefc9a55670')
                         OR (t.l2_id, t.term) IN (
                           ('intercom-alarm', 'скуд'), ('intercom-alarm', 'видеодомофон'),
                           ('driver-hourly', 'водитель'), ('driver-hourly', 'водитель на час'),
                           ('driver-hourly', 'трезвый водитель'), ('driver-hourly', 'личный водитель'),
                           ('driver-hourly', 'перегнать машину'), ('driver-hourly', 'перегон автомобиля'),
                           ('roadside-help', 'помощь на дороге'), ('roadside-help', 'прикурить'),
                           ('roadside-help', 'прикурить машину'), ('roadside-help', 'сел аккумулятор'),
                           ('roadside-help', 'подвезти бензин'), ('roadside-help', 'подвезти топливо'),
                           ('roadside-help', 'закончился бензин'), ('roadside-help', 'техпомощь'))))
     OR EXISTS (SELECT 1 FROM public.category_terms t
                 WHERE t.l3_id IN ('driver-own-car', 'driver-sober', 'driver-car-transfer',
                                   'road-jumpstart', 'road-fuel', 'road-wheel')) THEN
    RAISE EXCEPTION '0241_rollback_foreign_terms_on_new_rows';
  END IF;
  -- Ссылки на новые строки и перенесённые услуги.
  IF EXISTS (SELECT 1 FROM public.orders
              WHERE l2_id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')
                 OR l3_ids && ARRAY['alarm-security', 'alarm-fire', 'access-control', 'intercom-pro',
                                    'driver-own-car', 'driver-sober', 'driver-car-transfer',
                                    'road-jumpstart', 'road-fuel', 'road-wheel'])
     OR EXISTS (SELECT 1 FROM public.master_categories
              WHERE l2_id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')
                 OR l3_ids && ARRAY['alarm-security', 'alarm-fire', 'access-control', 'intercom-pro',
                                    'driver-own-car', 'driver-sober', 'driver-car-transfer',
                                    'road-jumpstart', 'road-fuel', 'road-wheel'])
     OR EXISTS (SELECT 1 FROM public.master_services
              WHERE l2_id IN ('intercom-alarm', 'driver-hourly', 'roadside-help')
                 OR l3_id IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro',
                              'driver-own-car', 'driver-sober', 'driver-car-transfer',
                              'road-jumpstart', 'road-fuel', 'road-wheel'))
     OR EXISTS (SELECT 1 FROM public.order_responses
              WHERE l2_id IN ('intercom-alarm', 'driver-hourly', 'roadside-help'))
     OR EXISTS (SELECT 1 FROM public.reviews
              WHERE l2_id IN ('intercom-alarm', 'driver-hourly', 'roadside-help'))
     OR EXISTS (SELECT 1 FROM xtrud_private.category_redirects
              WHERE from_l2 IN ('intercom-alarm', 'driver-hourly', 'roadside-help')
                 OR into_l2 IN ('intercom-alarm', 'driver-hourly', 'roadside-help'))
     OR EXISTS (SELECT 1 FROM xtrud_private.order_ai_classifications
              WHERE suggested_l2 IN ('intercom-alarm', 'driver-hourly', 'roadside-help'))
     OR EXISTS (SELECT 1 FROM public.articles WHERE category_l1_id = 'home-appliances') THEN
    RAISE EXCEPTION '0241_rollback_new_rows_referenced';
  END IF;
  -- Удалённые 0241 синонимы ещё не вернули.
  IF EXISTS (SELECT 1 FROM public.category_terms
              WHERE id IN ('7027cfd6-fa5a-4582-917b-512a1768f6b1',
                           'c49c3ecf-3b75-4e10-978e-9a9beae36562')) THEN
    RAISE EXCEPTION '0241_rollback_terms_already_restored';
  END IF;
END $$;

-- Синонимы.
DELETE FROM public.category_terms
 WHERE l2_id IS NOT NULL AND (l2_id, term) IN (
   ('pc-repair', 'замена экрана телефона'),
   ('intercom-alarm', 'скуд'), ('intercom-alarm', 'видеодомофон'));

UPDATE public.category_terms SET l2_id = 'security-systems'
 WHERE id IN ('c87c8500-d2c5-451f-b725-fd040f8953e6',   -- домофон
              '56188cdf-b692-4938-acee-dbefc9a55670');  -- сигнализация

INSERT INTO public.category_terms (id, l2_id, l3_id, term, weight, created_at) VALUES
  ('7027cfd6-fa5a-4582-917b-512a1768f6b1', 'locks-security', NULL, 'видеонаблюдение', 100,
   '2026-05-19 07:45:08.35977+00'),
  ('c49c3ecf-3b75-4e10-978e-9a9beae36562', 'locks-security', NULL, 'сигнализация', 100,
   '2026-05-19 07:45:08.35977+00');

-- Услуги обратно в security-systems; новые услуги — удалить.
UPDATE public.categories_l3 SET l2_id = 'security-systems'
 WHERE l2_id = 'intercom-alarm'
   AND id IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro');

DELETE FROM public.categories_l3
 WHERE id IN ('driver-own-car', 'driver-sober', 'driver-car-transfer',
              'road-jumpstart', 'road-fuel', 'road-wheel');

-- Новые подкатегории (их синонимы уходят по ON DELETE CASCADE).
DELETE FROM public.categories_l2 WHERE id IN ('intercom-alarm', 'driver-hourly', 'roadside-help');

-- appliance-repair обратно, раздел удалить.
UPDATE public.categories_l2 SET l1_id = 'tech-security' WHERE id = 'appliance-repair';
DELETE FROM public.categories_l1 WHERE id = 'home-appliances';

-- Имена.
UPDATE public.categories_l1 SET name_ru = 'Ремонт транспорта' WHERE id = 'auto';
UPDATE public.categories_l1 SET name_ru = 'Техника и безопасность' WHERE id = 'tech-security';
UPDATE public.categories_l2 SET name_ru = 'Автосервис и ремонт' WHERE id = 'car-repair';
UPDATE public.categories_l2 SET name_ru = 'Замки и безопасность' WHERE id = 'locks-security';
UPDATE public.categories_l2 SET name_ru = 'Видеонаблюдение и охрана' WHERE id = 'security-systems';

-- Порядок разделов.
UPDATE public.categories_l1 c SET sort_order = v.sort_order
  FROM (VALUES
    ('repair-finishing', 1), ('utilities', 2), ('construction', 3), ('home-services', 4),
    ('interior', 5), ('tech-security', 6), ('handyman-moving', 7), ('cargo', 8),
    ('computer-help', 10), ('auto', 11), ('tutors', 13), ('legal-accounting', 17)
  ) AS v(id, sort_order)
 WHERE c.id = v.id;

-- Порядок подкатегорий.
UPDATE public.categories_l2 c SET sort_order = v.sort_order
  FROM (VALUES
    ('cleaning', 1), ('housekeeping', 70), ('cleaning-post-renovation', 60), ('laundry', 2),
    ('disposal', 3), ('garden', 4), ('pest-control', 6), ('caregivers', 80),
    ('movers', 20), ('cargo-transport', 10), ('courier-delivery', 40), ('buy-deliver', 50),
    ('food-delivery', 60), ('tow-truck', 30),
    ('renovation', 40), ('painting', 100), ('wallpaper', 105), ('tiling', 130),
    ('floors', 140), ('drywall', 120), ('doors', 80), ('windows', 70),
    ('general-construction', 240)
  ) AS v(id, sort_order)
 WHERE c.id = v.id;

-- Постпроверки.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories_l1 WHERE id = 'home-appliances')
     OR EXISTS (SELECT 1 FROM public.categories_l2
                 WHERE id IN ('intercom-alarm', 'driver-hourly', 'roadside-help'))
     OR (SELECT l1_id FROM public.categories_l2 WHERE id = 'appliance-repair') <> 'tech-security'
     OR (SELECT count(*) FROM public.categories_l3
          WHERE l2_id = 'security-systems'
            AND id IN ('alarm-security', 'alarm-fire', 'access-control', 'intercom-pro')) <> 4
     OR (SELECT count(*) FROM public.category_terms
          WHERE (l2_id = 'security-systems' AND term IN ('домофон', 'сигнализация'))
             OR (l2_id = 'locks-security' AND term IN ('видеонаблюдение', 'сигнализация'))) <> 4
     OR EXISTS (SELECT 1 FROM public.category_terms
                 WHERE l2_id = 'pc-repair' AND term = 'замена экрана телефона')
     OR (SELECT string_agg(id, ',' ORDER BY sort_order, id) FROM public.categories_l1 WHERE is_active)
        IS DISTINCT FROM 'repair-finishing,utilities,construction,home-services,interior,'
          'tech-security,handyman-moving,cargo,computer-help,auto,tutors,legal-accounting' THEN
    RAISE EXCEPTION '0241_rollback_post_check_failed';
  END IF;
END $$;

COMMIT;
