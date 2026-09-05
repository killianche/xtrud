-- 0157 — крупные разделы каталога и единый стиль иконок.
--
-- DECISION владельца 2026-09-05: «надо, чтобы были крупные категории — типа
-- ремонт и строительство, юридические услуги и так далее, — а внутри них уже
-- более детальные. Иконки сильно различаются, нужны все в одном стиле».
--
-- ЧТО БЫЛО (FACT, запрос к живой базе). Верхних разделов два:
--   Строительство и ремонт — 37 видимых категорий
--   Дом и быт             — 5
-- Первый раздел собрал в себя почти весь каталог, поэтому на главной
-- показывался плоский список из 42 строк: от «Клининга» до «Бурения скважин».
-- Выбирать в нём нечего — он просто длинный.
--
-- ЧТО СТАЛО. Семь разделов, в каждом связанные между собой категории:
--   Ремонт и отделка · Сантехника и электрика · Строительство и участок ·
--   Дом и быт · Мебель и интерьер · Техника и безопасность ·
--   Мастер на час и переезды
-- Ни одна категория и ни одна услуга не удалена и не создана: меняется только
-- то, в каком разделе категория лежит.
--
-- ИКОНКИ. У каждой категории проставлено имя иконки из ОДНОГО набора
-- (Phosphor). Раньше в приложении одновременно жили три набора: цветные
-- Twemoji, цветные Fluent и линейные Lucide — на скриншоте владельца это
-- видно как «Клининг» тонкой линией рядом с объёмной каплей «Сантехники».
-- Имена сверены со списком иконок в node_modules/phosphor-react-native, а не
-- вспомнены.
--
-- Внутри разделов уникальность иконок соблюдена: две категории рядом не имеют
-- одинакового значка.

BEGIN;

-- ============================================================================
-- 1. Разделы
-- ============================================================================

INSERT INTO public.categories_l1 (id, name_ru, icon, sort_order, is_active) VALUES
  ('repair-finishing', 'Ремонт и отделка',          'PaintBrush',  1, true),
  ('utilities',        'Сантехника и электрика',    'Lightning',   2, true),
  ('construction',     'Строительство и участок',   'Crane',       3, true),
  ('home-services',    'Дом и быт',                 'Broom',       4, true),
  ('interior',         'Мебель и интерьер',         'Couch',       5, true),
  ('tech-security',    'Техника и безопасность',    'ShieldCheck', 6, true),
  ('handyman-moving',  'Мастер на час и переезды',  'Wrench',      7, true)
ON CONFLICT (id) DO UPDATE
  SET name_ru = EXCLUDED.name_ru,
      icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order,
      is_active = EXCLUDED.is_active;

-- ============================================================================
-- 2. Раскладка категорий по разделам + иконка каждой
-- ============================================================================

-- Ремонт и отделка
UPDATE public.categories_l2 SET l1_id = 'repair-finishing', icon = v.icon
FROM (VALUES
  ('renovation','Hammer'), ('painting','PaintBrush'), ('plaster-putty','PaintBucket'),
  ('wallpaper','Wall'), ('drywall','StackSimple'), ('tiling','GridFour'),
  ('floors','SquaresFour'), ('ceilings','Square'), ('tension-ceilings','Cloud'),
  ('doors','Door'), ('windows','AppWindow'), ('windows-doors','AppWindow'),
  ('finishing','Ruler'), ('decorative-installations','Compass'), ('glass','AppWindow')
) AS v(id, icon)
WHERE categories_l2.id = v.id;

-- Сантехника и электрика
UPDATE public.categories_l2 SET l1_id = 'utilities', icon = v.icon
FROM (VALUES
  ('plumbing','Drop'), ('water-sewer','Pipe'), ('climate','Thermometer'),
  ('electrical','Lightning')
) AS v(id, icon)
WHERE categories_l2.id = v.id;

-- Строительство и участок
UPDATE public.categories_l2 SET l1_id = 'construction', icon = v.icon
FROM (VALUES
  ('general-construction','Crane'), ('concrete','TrafficCone'), ('masonry','Cube'),
  ('welding','Fire'), ('roofing','House'), ('facade','Buildings'),
  ('insulation','Snowflake'), ('demolition','HardHat'), ('drilling-wells','Shovel'),
  ('fences-gates','Garage'), ('baths-pools','Waves'), ('landscape','TreeEvergreen'),
  ('materials-delivery','Package')
) AS v(id, icon)
WHERE categories_l2.id = v.id;

-- Дом и быт
UPDATE public.categories_l2 SET l1_id = 'home-services', icon = v.icon
FROM (VALUES
  ('cleaning','Broom'), ('laundry','WashingMachine'), ('disposal','Trash'),
  ('garden','Plant'), ('pest-control','Bug'), ('cleaning-post-renovation','Sparkle')
) AS v(id, icon)
WHERE categories_l2.id = v.id;

-- Мебель и интерьер
UPDATE public.categories_l2 SET l1_id = 'interior', icon = v.icon
FROM (VALUES
  ('furniture','Couch'), ('curtains-blinds','Rows'), ('interior-design','PencilRuler')
) AS v(id, icon)
WHERE categories_l2.id = v.id;

-- Техника и безопасность
UPDATE public.categories_l2 SET l1_id = 'tech-security', icon = v.icon
FROM (VALUES
  ('appliance-repair','Gear'), ('satellite-tv','Broadcast'),
  ('security-systems','SecurityCamera'), ('locks-security','Key'),
  ('appliances','Fan'), ('tv-internet','Television')
) AS v(id, icon)
WHERE categories_l2.id = v.id;

-- Мастер на час и переезды
UPDATE public.categories_l2 SET l1_id = 'handyman-moving', icon = v.icon
FROM (VALUES
  ('handyman','Wrench'), ('movers','Truck'), ('other','DotsThree')
) AS v(id, icon)
WHERE categories_l2.id = v.id;

-- ============================================================================
-- 3. Проверки. Молча уехать эта миграция не должна.
-- ============================================================================

DO $$
DECLARE
  v_orphans int;
  v_no_icon int;
  v_dupes text;
  v_l1 int;
BEGIN
  SELECT count(*) INTO v_l1 FROM public.categories_l1 WHERE is_active;
  IF v_l1 <> 7 THEN
    RAISE EXCEPTION 'ожидалось 7 разделов, получено %', v_l1;
  END IF;

  -- Ни одна категория не осталась без раздела.
  SELECT count(*) INTO v_orphans
  FROM public.categories_l2 l2
  WHERE l2.l1_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.categories_l1 l1 WHERE l1.id = l2.l1_id);
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'категорий без раздела: %', v_orphans;
  END IF;

  -- У каждой видимой категории есть иконка.
  SELECT count(*) INTO v_no_icon
  FROM public.categories_l2 WHERE is_visible AND (icon IS NULL OR icon = '');
  IF v_no_icon > 0 THEN
    RAISE EXCEPTION 'видимых категорий без иконки: %', v_no_icon;
  END IF;

  -- Внутри одного раздела иконки не повторяются: иначе список выглядит
  -- одинаковым и значок перестаёт что-либо различать.
  SELECT string_agg(l1_id || '/' || icon, ', ') INTO v_dupes
  FROM (
    SELECT l1_id, icon FROM public.categories_l2
    WHERE is_visible GROUP BY l1_id, icon HAVING count(*) > 1
  ) d;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'повторяющиеся иконки внутри раздела: %', v_dupes;
  END IF;
END $$;

COMMIT;
