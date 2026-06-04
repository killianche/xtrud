# CATEGORIES_AND_PROFILES.md — Таксономия и профили xtrud

> Полная система категорий услуг, полей профиля мастера, полей заказа, dual-role логики, мультикатегорийности, архитектуры хранения фото и схемы БД.
>
> Цель документа — зафиксировать все таксономические и data-решения **до старта разработки**. Таксономию маркетплейса нельзя переделывать после запуска без катастрофы — миграция десятков тысяч профилей и заказов между категориями убивает продукт.
>
> Связанные документы:
> - [PROJECT_MAP.md](PROJECT_MAP.md) — концепция и фичи (особенно §5.12)
> - [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — стайлгайд
> - [CROSS_PLATFORM_RULES.md](CROSS_PLATFORM_RULES.md) — технические правила Expo + RN + Web

---

## Product scope (MVP) — ⚠️ только construction + home-services

**Решение user 2026-05-15: «У нас только ремонт, стройка и быт (включая клининг)».**

Изначально каталог содержал 10 L1. Миграция [`0068_drop_out_of_scope_categories.sql`](supabase/migrations/0068_drop_out_of_scope_categories.sql) **физически удалила** 8 L1 из БД (Авто, Перевозки, Бьюти, Образование, События, Бизнес, IT, Личный сервис) вместе со всеми их L2/L3, master_categories, orders, order_responses, reviews. После миграции в БД остались **2 L1 раздела:**

- `construction` (Строительство и ремонт) — 41 L2
- `home-services` (Дом и быт, включая клининг) — 7 L2

Итого **48 L2 / 280 L3**.

**Зачем физическое удаление:** на dev/demo-окружении out-of-scope категории создавали путаницу (фильтры показывали «шиномонтаж/ресницы/IT»), а seed-мастера в этих L1 светились как orphaned данные. Полное удаление чище для нишевого сервиса под ремонт+быт. Если когда-то решим возвращать — restore из backup или re-seed нужных таблиц.

**Второй защитный слой — `IN_SCOPE_L1_IDS`** в [`src/lib/product-scope.ts`](src/lib/product-scope.ts). Сейчас содержит `["construction", "home-services"]` — после миграции 0068 это совпадает с реальным состоянием БД. Если когда-то re-seed случайно вернёт oos L1, фильтр выкинет их из UI.

**Где применяется фильтр:**
- `useCategoriesL1()` — отдаёт только in-scope L1
- `useVisibleCategories()` — отдаёт только L2 чьи `l1_id IN scope`
- Все вышестоящие потребители (filters, category-select, master-categories онбординг, etc.) автоматически получают отфильтрованный список

**Расширение scope (если когда-то вернуть авто/бьюти):**
1. Re-seed нужных категорий через миграцию (восстановить L1 + L2 + L3)
2. Добавить L1 id в `IN_SCOPE_L1_IDS`

---

## TL;DR

- **Категории:** 3 уровня. **L1 = 2** (`construction` + `home-services` — после миграции 0068 8 L1 физически удалены, см. блок выше), **L2 = 48** (41 construction + 7 home-services), **L3 = 280**.
- **Dual-role:** один аккаунт, две роли (`is_client` + `is_master`), переключение через UI-свитчер. Профиль мастера — отдельная таблица `master_profiles` с FK на `users`.
- **Мультикатегорийность:** до **5 категорий L2** на мастера. Общий профиль, общее портфолио (с тегами категорий), раздельный рейтинг по L1, раздельные цены, отклик идёт **от конкретной L2-категории**.
- **Фото:** Supabase Storage с трансформациями + Cloudflare R2 для оригиналов, ресайз и формат-конверсия на клиенте через `expo-image-manipulator`. Экономный план — 30 фото портфолио по 200 KB, ~3 ГБ на 1000 мастеров, ~$0.06/мес.
- **Category-specific поля:** гибридный подход — JSONB-колонка `attributes` в `master_categories` и `orders`, плюс типовой каталог полей в `category_fields` (для рендера форм и фильтров). Не EAV.

---

## Раздел 1. Полное дерево категорий

### 1.1. Принципы построения дерева

1. **L1** — крупная сфера жизни. Это «вход» в каталог. На главной видны 10 крупных плиток (как в Cal.com bento-grid). Иконки и фото-фоны — атмосферные.
2. **L2** — категория. Это то, по чему мастер позиционирует себя («я электрик», «я маникюрша»). Бейдж в карточке, фильтр в каталоге.
3. **L3** — конкретная услуга / задача. Это то, что клиент пишет в заказе («замена розетки», «маникюр с покрытием»). Используется как тег для роутинга заказа и как чекбоксы в профиле мастера («я делаю это, это и это»).
4. Каждый L3 имеет: **id**, **slug** (для URL и БД), **emoji** (для мобильной выдачи как fallback), **lucide-icon-name** (для UI), **avg_check** (медиана в рублях), **urgency_typical** (3 значения: `urgent` / `week` / `month`).
5. Каждая L1/L2 имеет: иконка, изображение-обложка (атмосферный фон для tile), счётчик мастеров.
6. **Региональная адаптация:** добавлены категории, важные именно для Ингушетии — арабский язык, чтение Корана, ингушский язык, кейтеринг на свадьбу/поминки, мастерская тейп-стилистика как опц. фильтр (не категория).

### 1.2. Сводка по уровням

| L1 (10) | L2 (всего 64) | L3 (всего ≈290) |
|---|---|---|
| 1. Строительство и ремонт | 12 | 65 |
| 2. Дом и быт | 7 | 28 |
| 3. Авто и техника | 4 | 22 |
| 4. Перевозки и спецтехника | 3 | 15 |
| 5. Бьюти и здоровье | 7 | 32 |
| 6. Образование | 6 | 30 |
| 7. События и торжества | 6 | 26 |
| 8. Бизнес и финансы | 5 | 18 |
| 9. IT и цифровое | 4 | 16 |
| 10. Личный сервис | 10 | 38 |

### 1.3. Дерево (полное)

Ниже — иерархия. Для каждого L3 указан **id** (slug), **lucide-icon** (для родителя L2 либо собственный), **avg_check ₽**, **urgency**.

---

#### L1.1 — Строительство и ремонт `construction` — `Hammer`

##### L2 — Общестроительные работы `general-construction` — `HardHat`
- `foundation` — Фундамент (заливка, армирование) | `Layers` | 200 000 ₽ | month
- `walls-brick` — Кладка кирпича / блока | `Brick` (fallback `Square`) | 80 000 ₽ | month
- `roof-installation` — Кровля под ключ | `Home` | 150 000 ₽ | month
- `roof-repair` — Ремонт кровли (течь, замена листа) | `Wrench` | 8 000 ₽ | week
- `overlap` — Перекрытия (монолит, балки) | `Layers` | 120 000 ₽ | month
- `facade` — Фасадные работы (сайдинг, штукатурка, утепление) | `Building` | 90 000 ₽ | month
- `turnkey` — Стройка дома под ключ | `Home` | 2 500 000 ₽ | month

##### L2 — Отделочные работы `finishing` — `Paintbrush`
> ⚠️ **DEPRECATED (2026-05-16):** L2 `finishing` помечен `is_visible=false`. Был задуман как агрегатор «всё про отделку», но потом разбит на отдельные L2 (`painting`, `tiling`, `drywall`, `floors`, `ceilings` и т.д.). L3 ниже фактически живут в новых L2 — см. соответствующие разделы. Этот блок оставлен для исторической справки.
>
> **Где живёт что:**
> - Штукатурка, шпаклёвка, покраска, **обои**, декоративные покрытия → L2 `painting` (см. ниже)
> - Плитка → L2 `tiling`
> - Полы / ламинат / стяжка → L2 `floors`
> - Гипсокартон → L2 `drywall`
> - Потолки → L2 `ceilings` / `tension-ceilings`

##### L2 — Штукатурка, шпаклёвка, покраска `painting` — `Paintbrush`
**Покраска (sort 10..70):**
- `paint-walls` — Покраска стен | `Paintbrush` | 350 ₽/м² | week
- `paint-ceiling` — Покраска потолка | `Paintbrush` | 400 ₽/м² | week
- `paint-facade` — Покраска фасада | `Paintbrush` | 500 ₽/м² | week
- `paint-radiator` — Покраска радиаторов / труб | `Paintbrush` | 800 ₽ | week
- `paint-finish-putty` — Финишная шпаклёвка под покраску | `Paintbrush` | 250 ₽/м² | week
- `paint-sanding` — Шлифовка стен | `Paintbrush` | 200 ₽/м² | week
- `paint-decorative` — Декоративная покраска | `Paintbrush` | 1 200 ₽/м² | week

**Обои (sort 80..150, добавлено 2026-05-16):**
- `wallpaper-vinyl` — Поклейка виниловых обоев | `Layers` | 350 ₽/м² | week
- `wallpaper-fleece` — Поклейка флизелиновых обоев | `Layers` | 400 ₽/м² | week
- `wallpaper-paper` — Поклейка бумажных обоев | `Layers` | 250 ₽/м² | week
- `wallpaper-paintable` — Поклейка обоев под покраску | `Layers` | 300 ₽/м² | week
- `wallpaper-photo` — Поклейка фотообоев | `Image` | 450 ₽/м² | week
- `wallpaper-liquid` — Нанесение жидких обоев | `Droplet` | 600 ₽/м² | week
- `wallpaper-removal` — Удаление старых обоев | `Trash2` | 150 ₽/м² | week
- `wallpaper-repair` — Ремонт обоев (стыки, пузыри) | `Wrench` | 500 ₽ | week

**Декоративная штукатурка (sort 160..190, добавлено 2026-05-16):**
- `plaster-venetian` — Венецианская штукатурка | `Sparkles` | 1 500 ₽/м² | month
- `plaster-koroed` — Штукатурка короед | `Layers` | 500 ₽/м² | month
- `plaster-silk` — Шёлковая штукатурка | `Sparkles` | 1 200 ₽/м² | month
- `plaster-microcement` — Микроцемент / арт-бетон | `Square` | 1 800 ₽/м² | month

**Базовая штукатурка / шпаклёвка (sort 200..250, перенесено из deprecated `plaster-putty` в 2026-05-16):**
- `plaster-machine` — Машинная штукатурка | `Paintbrush` | 350 ₽/м² | week
- `plaster-manual` — Ручная штукатурка | `Paintbrush` | 400 ₽/м² | week
- `plaster-beacons` — Штукатурка по маякам | `Paintbrush` | 450 ₽/м² | week
- `putty-walls` — Шпаклёвка стен | `Paintbrush` | 250 ₽/м² | week
- `putty-ceiling` — Шпаклёвка потолка | `Paintbrush` | 280 ₽/м² | week
- `walls-level` — Выравнивание стен | `Paintbrush` | 350 ₽/м² | week

**Известные synonyms в `category_terms`:** обои, оклейка, поклеить обои, переклеить, флизелин, флизелиновые, винил, виниловые, бумажные обои, фотообои, жидкие обои, снять/удалить/содрать обои, ремонт обоев, декоративная штукатурка, декоратив, фактурка, венецианка, венецианская, короед, шёлковая штукатурка, микроцемент, арт-бетон, бетон-эффект.

##### L2 — Плитка и мозаика, ламинат, стяжка
Перенесено в L2 `tiling` (плитка), `floors` (ламинат, стяжка), `drywall` (гипсокартон). См. таблицу всех L2 ниже.

##### L2 — Электрика `electrical` — `Zap`
- `outlet-replace` — Замена розетки / выключателя | `Plug` | 800 ₽ | urgent
- `outlet-install` — Установка новой розетки | `Plug` | 1 500 ₽ | week
- `wiring-house` — Электропроводка в доме | `Zap` | 60 000 ₽ | month
- `wiring-apt` — Электропроводка в квартире | `Zap` | 40 000 ₽ | month
- `panel-install` — Сборка / установка электрощита | `LayoutGrid` | 12 000 ₽ | week
- `lighting-install` — Установка люстры / светильника | `Lightbulb` | 1 500 ₽ | week
- `lighting-led` — Монтаж LED-подсветки | `Lightbulb` | 5 000 ₽ | week
- `troubleshoot` — Поиск и устранение неисправности | `AlertCircle` | 2 000 ₽ | urgent
- `grounding` — Заземление | `Zap` | 8 000 ₽ | month

##### L2 — Сантехника `plumbing` — `Droplet`
- `faucet-replace` — Замена смесителя | `Droplet` | 1 500 ₽ | urgent
- `toilet-install` — Установка унитаза | `Droplet` | 3 000 ₽ | week
- `bath-install` — Установка ванны / душевой | `Droplet` | 8 000 ₽ | week
- `wash-machine-connect` — Подключение стиральной / посудомоечной | `Droplet` | 2 500 ₽ | week
- `boiler-install` — Установка водонагревателя | `Flame` | 6 000 ₽ | week
- `pipes-replace` — Замена труб (металлопластик / полипропилен) | `GitBranch` | 25 000 ₽ | month
- `sewer` — Прочистка / монтаж канализации | `Pipette` | 4 000 ₽ | urgent
- `gas-boiler` — Газовый котёл (только с лицензией) | `Flame` | 15 000 ₽ | week
- `heating-install` — Монтаж отопления (радиаторы, тёплый пол) | `Thermometer` | 80 000 ₽ | month

##### L2 — Окна, двери, конструкции `windows-doors` — `DoorOpen`
- `windows-pvc` — Пластиковые окна (замер, монтаж) | `RectangleVertical` | 18 000 ₽ | week
- `windows-wood` — Деревянные окна | `RectangleVertical` | 25 000 ₽ | month
- `door-entry` — Установка входной двери | `DoorOpen` | 8 000 ₽ | week
- `door-interior` — Установка межкомнатной двери | `DoorOpen` | 3 500 ₽ | week
- `gates-install` — Ворота (распашные, откатные) | `DoorOpen` | 60 000 ₽ | month
- `gates-automation` — Автоматика на ворота | `Cog` | 25 000 ₽ | month
- `fence` — Заборы (профлист, сетка, кирпич) | `Fence` | 1 200 ₽/п.м. | month
- `canopy` — Навесы (поликарбонат, металл) | `Umbrella` | 35 000 ₽ | month

##### L2 — Потолки `ceilings` — `Square`
- `ceiling-tension` — Натяжной потолок | `Square` | 450 ₽/м² | week
- `ceiling-suspended` — Подвесной потолок (Армстронг) | `Square` | 700 ₽/м² | week
- `ceiling-drywall` — Гипсокартонный потолок (многоуровневый) | `Layers` | 1 500 ₽/м² | week

##### L2 — Сварка `welding` — `Flame`
- `weld-gates` — Сварка ворот / решёток | `Flame` | 8 000 ₽ | week
- `weld-pipe` — Сварка труб | `Flame` | 3 000 ₽ | week
- `weld-onsite` — Выезд со сварочным аппаратом | `Flame` | 2 500 ₽/час | urgent

##### L2 — Отопление `climate` (бывш. «Климат и отопление») — термометр
> ⚠️ Реструктуризация 2026-05-27 (решение владельца): `climate` переименован
> в **«Отопление»**. Кондиционеры (`ac-install`, `ac-service`, `ac-uninstall`)
> перенесены в **«Ремонт бытовой техники»** (`appliance-repair`). Категория
> **«Водоснабжение и канализация»** (`water-sewer`) — была скрыта, теперь
> видима как самостоятельная (контент: трубы, канализация, септик, насос).
> Состав `climate` сейчас: вентиляция, монтаж радиаторов, тёплый плинтус,
> газовый/электрокотёл, промывка системы отопления.

##### L2 — Натяжные изделия и потолки `decorative-installations` — `Sparkles`
- `wall-panels` — Стеновые панели (3D, ПВХ) | `Layers` | 800 ₽/м² | week
- `decorative-paint` — Декоративная штукатурка / краска | `Paintbrush` | 700 ₽/м² | week

##### L2 — Мебель `furniture` — `Armchair`
- `furniture-assembly` — Сборка мебели (IKEA-стиль) | `Wrench` | 1 500 ₽ | week
- `furniture-custom` — Изготовление на заказ (кухня, шкаф-купе) | `Armchair` | 60 000 ₽ | month
- `furniture-repair` — Реставрация / ремонт | `Wrench` | 5 000 ₽ | week

##### L2 — Малые работы по дому `handyman` — `Wrench`
- `mount-tv` — Повесить телевизор / полку | `Wrench` | 1 000 ₽ | urgent
- `door-lock` — Замена дверного замка | `Lock` | 1 500 ₽ | urgent
- `drill-holes` — Просверлить отверстия / повесить картины | `Wrench` | 800 ₽ | urgent
- `seal-window` — Заделать щели / утеплить окно | `Wrench` | 2 000 ₽ | week

##### L2 — Стройматериалы (доставка) `materials-delivery` — `PackageOpen`
- `materials-cement` — Доставка цемента / песка | `Truck` | по тарифу | week
- `materials-bricks` — Доставка кирпича / блоков | `Truck` | по тарифу | week

---

#### L1.2 — Дом и быт `home-services` — `Home`

##### L2 — Клининг `cleaning` — `Sparkles`
- `cleaning-general` — Генеральная уборка | `Sparkles` | 3 500 ₽ | week
- `cleaning-post-renovation` — Уборка после ремонта | `Sparkles` | 6 000 ₽ | week
- `cleaning-regular` — Регулярная уборка (раз в неделю) | `Sparkles` | 2 500 ₽ | week
- `cleaning-windows` — Мытьё окон | `Square` | 200 ₽/окно | week

##### L2 — Стирка и чистка `laundry` — `Droplets`
- `carpet-cleaning` — Стирка ковров | `LayoutGrid` | 200 ₽/м² | week
- `upholstery-cleaning` — Химчистка мягкой мебели | `Armchair` | 1 500 ₽ | week
- `curtains-cleaning` — Стирка штор | `Wind` | 800 ₽ | week

##### L2 — Утилизация и вывоз `disposal` — `Trash2`
- `garbage-removal` — Вывоз строймусора | `Trash2` | 4 000 ₽ | week
- `junk-removal` — Вывоз старой мебели / хлама | `Trash2` | 2 500 ₽ | week

##### L2 — Сад и участок `garden` — `Trees`
- `lawn-mowing` — Стрижка газона | `Scissors` | 1 500 ₽ | week
- `tree-cutting` — Спил деревьев | `Trees` | 5 000 ₽/дерево | week
- `landscaping` — Ландшафтный дизайн | `Trees` | 50 000 ₽ | month
- `garden-planting` — Посадка кустов / деревьев | `Sprout` | 500 ₽/шт | month

##### L2 — Спутник, ТВ и интернет `tv-internet` — `Antenna`
- `satellite-install` — Установка спутниковой антенны (Триколор и др.) | `Satellite` | 3 000 ₽ | week
- `internet-setup` — Настройка интернета / Wi-Fi | `Wifi` | 1 500 ₽ | urgent
- `tv-mount` — Настройка ТВ-приставки / Smart TV | `Tv` | 1 500 ₽ | week

##### L2 — Дезинфекция и борьба с вредителями `pest-control` — `Bug`
- `pest-cockroach` — Тараканы / клопы | `Bug` | 2 500 ₽ | urgent
- `pest-mice` — Грызуны | `Bug` | 3 000 ₽ | urgent

##### L2 — Бытовая техника `appliances` — `Refrigerator`
- `fridge-repair` — Ремонт холодильника | `Refrigerator` | 3 000 ₽ | urgent
- `washmachine-repair` — Ремонт стиральной машины | `WashingMachine` | 2 500 ₽ | urgent
- `oven-repair` — Ремонт духовки / плиты | `Flame` | 2 500 ₽ | week
- `appliance-install` — Подключение бытовой техники | `Plug` | 1 500 ₽ | week

---

#### L1.3 — Авто и техника `auto` — `Car`

##### L2 — СТО общее `auto-service` — `Wrench`
- `oil-change` — Замена масла / фильтров | `Droplet` | 2 000 ₽ | week
- `diagnostics` — Компьютерная диагностика | `Cpu` | 1 500 ₽ | urgent
- `brakes` — Тормоза (колодки, диски) | `Disc` | 4 500 ₽ | urgent
- `suspension` — Подвеска (стойки, рычаги) | `Wrench` | 8 000 ₽ | week
- `engine-repair` — Ремонт двигателя | `Cog` | 35 000 ₽ | week
- `gearbox` — Ремонт коробки передач | `Cog` | 25 000 ₽ | week

##### L2 — Шиномонтаж `tire-service` — `Disc`
- `tire-change` — Сезонная переобувка | `Disc` | 2 000 ₽ | urgent
- `tire-repair` — Ремонт прокола | `Disc` | 500 ₽ | urgent
- `tire-balance` — Балансировка | `Disc` | 1 000 ₽ | week

##### L2 — Кузовные и малярные работы `body-paint` — `Paintbrush`
- `body-repair` — Кузовной ремонт после ДТП | `Car` | 25 000 ₽ | week
- `painting-car` — Покраска автомобиля | `Paintbrush` | 80 000 ₽ | month
- `polish` — Полировка кузова | `Sparkles` | 4 500 ₽ | week
- `dent-repair` — Удаление вмятин без покраски | `Car` | 3 500 ₽ | week
- `windshield-replace` — Замена лобового стекла | `Square` | 8 000 ₽ | week

##### L2 — Мойка и детейлинг `car-wash` — `Droplets`
- `car-wash-complex` — Комплекс мойка | `Droplets` | 800 ₽ | urgent
- `interior-cleaning` — Химчистка салона | `Sparkles` | 4 500 ₽ | week
- `mobile-wash` — Выездная мойка | `Truck` | 1 500 ₽ | urgent

##### L2 — Выездная техпомощь `roadside` — `LifeBuoy`
- `jumpstart` — Прикурить аккумулятор / запуск | `Battery` | 800 ₽ | urgent
- `mobile-diagnostics` — Выездная диагностика | `Cpu` | 2 500 ₽ | urgent

---

#### L1.4 — Перевозки и спецтехника `transport` — `Truck`

##### L2 — Грузоперевозки `cargo` — `Truck`
- `gazelle` — Газель (1.5-3 т) | `Truck` | 800 ₽/час | urgent
- `cargo-large` — Фура / 5+ тонн | `Truck` | 2 500 ₽/час | week
- `movers` — Грузчики | `Users` | 500 ₽/час/чел | urgent
- `apartment-move` — Квартирный переезд под ключ | `PackageOpen` | 8 000 ₽ | week
- `intercity` — Межгород (Магас–Назрань и далее) | `Truck` | 25 ₽/км | week

##### L2 — Спецтехника `heavy-equipment` — `Truck`
- `manipulator` — Манипулятор | `Truck` | 2 500 ₽/час | week
- `excavator` — Экскаватор | `Wrench` | 2 500 ₽/час | week
- `crane` — Автокран | `Truck` | 3 500 ₽/час | week
- `bulldozer` — Бульдозер / трактор | `Truck` | 2 000 ₽/час | week
- `dumper` — Самосвал | `Truck` | 1 500 ₽/час | week

##### L2 — Эвакуатор и буксировка `towing` — `Truck`
- `tow-light` — Эвакуатор легковой | `Truck` | 2 500 ₽ | urgent
- `tow-truck` — Эвакуатор грузовой | `Truck` | 6 000 ₽ | urgent
- `mobile-fuel` — Подвоз топлива | `Fuel` | 1 500 ₽ | urgent

##### L2 — Курьеры и доставка `delivery` — `Package`
- `courier-city` — Курьер по городу | `Package` | 400 ₽ | urgent
- `delivery-food` — Доставка еды / продуктов | `ShoppingBag` | 300 ₽ | urgent

---

#### L1.5 — Бьюти и здоровье `beauty-health` — `Scissors`

##### L2 — Маникюр и педикюр `nails` — `Hand`
- `manicure-classic` — Классический маникюр | `Hand` | 800 ₽ | week
- `manicure-gel` — Маникюр с гель-лаком | `Hand` | 1 500 ₽ | week
- `pedicure` — Педикюр | `Footprints` | 1 800 ₽ | week
- `nails-extension` — Наращивание ногтей | `Hand` | 2 500 ₽ | week
- `manicure-mobile` — Маникюр на дому | `Hand` | 1 800 ₽ | week

##### L2 — Брови и ресницы `lashes-brows` — `Eye`
- `lashes-classic` — Наращивание ресниц | `Eye` | 1 800 ₽ | week
- `lashes-volume` — Объёмное наращивание | `Eye` | 2 800 ₽ | week
- `brows-shaping` — Коррекция бровей | `Eye` | 600 ₽ | week
- `brows-tint` — Окрашивание бровей | `Eye` | 800 ₽ | week
- `brows-laminate` — Ламинирование бровей | `Eye` | 1 500 ₽ | week
- `lashes-laminate` — Ламинирование ресниц | `Eye` | 2 000 ₽ | week

##### L2 — Парикмахер `hair` — `Scissors`
- `haircut-women` — Женская стрижка | `Scissors` | 1 200 ₽ | week
- `haircut-men` — Мужская стрижка | `Scissors` | 700 ₽ | week
- `haircut-kids` — Детская стрижка | `Scissors` | 500 ₽ | week
- `hair-color` — Окрашивание | `Palette` | 3 500 ₽ | week
- `hair-styling` — Укладка / причёска (свадебная) | `Sparkles` | 3 000 ₽ | week
- `hair-keratin` — Кератиновое выпрямление | `Sparkles` | 6 000 ₽ | week

##### L2 — Косметология `cosmetology` — `Sparkles`
- `facial-cleaning` — Чистка лица | `User` | 2 500 ₽ | week
- `peeling` — Пилинг | `Sparkles` | 3 500 ₽ | week
- `injections` — Уколы красоты (только с лицензией) | `Syringe` | 6 000 ₽ | week

##### L2 — Массаж `massage` — `Hand`
- `massage-classic` — Классический массаж | `Hand` | 1 800 ₽ | week
- `massage-therapy` — Лечебный массаж | `Stethoscope` | 2 500 ₽ | week
- `massage-children` — Детский массаж | `Baby` | 1 500 ₽ | week

##### L2 — Стилист / визажист `stylist` — `Palette`
- `makeup-day` — Дневной макияж | `Palette` | 2 500 ₽ | week
- `makeup-wedding` — Свадебный макияж | `Palette` | 6 000 ₽ | week
- `stylist-consult` — Шопер / стилист по гардеробу | `Shirt` | 3 500 ₽ | week

##### L2 — Медицина на дому `home-medical` — `Stethoscope`
- `injections-home` — Уколы / капельницы (медсестра) | `Syringe` | 500 ₽ | urgent
- `rehab` — Реабилитация после травмы | `Stethoscope` | 2 500 ₽ | week
- `wound-care` — Перевязки, уход за раной | `Bandage` | 800 ₽ | urgent

---

#### L1.6 — Образование `education` — `GraduationCap`

##### L2 — Школьные предметы `school-subjects` — `BookOpen`
- `math-school` — Математика (1-11 кл.) | `Calculator` | 700 ₽/час | week
- `russian-school` — Русский язык | `BookOpen` | 700 ₽/час | week
- `physics-school` — Физика | `Atom` | 800 ₽/час | week
- `chemistry-school` — Химия | `FlaskConical` | 800 ₽/час | week
- `biology-school` — Биология | `Sprout` | 700 ₽/час | week
- `history-school` — История / Обществознание | `BookOpen` | 700 ₽/час | week
- `informatics-school` — Информатика | `Code` | 800 ₽/час | week

##### L2 — Подготовка к экзаменам `exam-prep` — `GraduationCap`
- `ege-prep` — ЕГЭ (укажет предмет в анкете) | `GraduationCap` | 1 200 ₽/час | month
- `oge-prep` — ОГЭ | `GraduationCap` | 900 ₽/час | month
- `vpr-prep` — ВПР | `GraduationCap` | 700 ₽/час | week
- `university-entry` — Поступление в ВУЗ (комплексно) | `GraduationCap` | 25 000 ₽/мес | month

##### L2 — Языки `languages` — `Languages`
- `english` — Английский | `Languages` | 1 000 ₽/час | week
- `arabic` — Арабский | `Languages` | 1 200 ₽/час | week
- `ingush` — Ингушский | `Languages` | 600 ₽/час | week
- `chechen` — Чеченский | `Languages` | 600 ₽/час | week
- `russian-foreign` — Русский как иностранный | `Languages` | 1 000 ₽/час | week
- `turkish` — Турецкий | `Languages` | 1 200 ₽/час | week

##### L2 — Религиозное образование `religious-education` — `BookOpen`
- `quran-reading` — Чтение Корана | `BookOpen` | 800 ₽/час | week
- `quran-memorization` — Заучивание сур (Хифз) | `BookOpen` | 1 000 ₽/час | week
- `islamic-basics` — Основы исламского вероучения | `BookOpen` | 700 ₽/час | week

##### L2 — Дополнительное образование `extra-education` — `Sparkles`
- `chess` — Шахматы | `Crown` | 800 ₽/час | week
- `music-instruments` — Музыкальные инструменты | `Music` | 1 000 ₽/час | week
- `vocal` — Вокал / пение | `Mic` | 1 200 ₽/час | week
- `drawing` — Рисование | `Palette` | 800 ₽/час | week
- `programming-kids` — Программирование для детей | `Code` | 1 500 ₽/час | week
- `speech-therapy` — Логопед | `MessageCircle` | 1 200 ₽/час | week

##### L2 — Спорт и фитнес `sports-coach` — `Dumbbell`
- `personal-trainer` — Персональный тренер | `Dumbbell` | 1 500 ₽/час | week
- `yoga` — Йога | `User` | 1 000 ₽/час | week
- `boxing-coach` — Бокс / единоборства | `Dumbbell` | 1 500 ₽/час | week
- `swimming` — Плавание | `Waves` | 1 500 ₽/час | week

---

#### L1.7 — События и торжества `events` — `PartyPopper`

##### L2 — Кейтеринг и кухня `catering` — `Utensils`
- `wedding-catering` — Свадебный стол | `Utensils` | от 800 ₽/чел | month
- `funeral-catering` — Поминальный стол | `Utensils` | от 500 ₽/чел | urgent
- `banquet-cooking` — Повар на банкет | `ChefHat` | 12 000 ₽ | week
- `home-chef` — Повар на дом | `ChefHat` | 3 500 ₽ | week
- `national-cuisine` — Национальная кухня (ингушская/кавказская) | `Utensils` | от 700 ₽/чел | month

##### L2 — Кондитеры и торты `confectionery` — `Cake`
- `wedding-cake` — Свадебный торт | `Cake` | 3 500 ₽/кг | month
- `birthday-cake` — Праздничный торт | `Cake` | 1 800 ₽/кг | week
- `desserts` — Капкейки / пироги / макаруны | `Cookie` | 200 ₽/шт | week

##### L2 — Ведущие, музыканты `entertainment` — `Mic`
- `host-russian` — Ведущий / тамада | `Mic` | 25 000 ₽ | month
- `host-ingush` — Ведущий на ингушском | `Mic` | 20 000 ₽ | month
- `singer` — Певец / певица | `Music` | 15 000 ₽ | month
- `accordion` — Гармонист | `Music` | 10 000 ₽ | month
- `ensemble` — Ансамбль / группа | `Music` | 40 000 ₽ | month
- `dj` — DJ | `Disc3` | 15 000 ₽ | month
- `animator` — Аниматор детский | `Smile` | 5 000 ₽ | week

##### L2 — Декор и оформление `decor` — `Sparkles`
- `arch-flowers` — Свадебная арка / цветы | `Flower2` | 25 000 ₽ | month
- `balloons` — Шары / фотозоны | `Sparkles` | 8 000 ₽ | week
- `tables-decor` — Сервировка / президиум | `Utensils` | 15 000 ₽ | month
- `hall-decor` — Оформление зала | `Sparkles` | 35 000 ₽ | month

##### L2 — Фото и видео `photo-video` — `Camera`
- `photo-wedding` — Свадебный фотограф | `Camera` | 25 000 ₽ | month
- `video-wedding` — Свадебный видеограф | `Video` | 35 000 ₽ | month
- `photo-event` — Репортажная фотосъёмка | `Camera` | 8 000 ₽ | week
- `studio-photo` — Студийная фотосессия | `Camera` | 4 500 ₽ | week
- `drone` — Аэросъёмка дрон | `Plane` | 8 000 ₽ | week

##### L2 — Прокат и аренда `rentals` — `Package`
- `dress-rental` — Прокат свадебного / вечернего платья | `Shirt` | 5 000 ₽ | week
- `car-wedding` — Свадебный кортеж / лимузин | `Car` | 8 000 ₽ | month
- `tent-rental` — Аренда шатра / мебели | `Tent` | 25 000 ₽ | month

---

#### L1.8 — Бизнес и финансы `business` — `Briefcase`

##### L2 — Юридические услуги `legal` — `Scale`
- `legal-consult` — Консультация юриста | `Scale` | 1 500 ₽ | week
- `contracts` — Составление договоров | `FileText` | 3 500 ₽ | week
- `court-rep` — Представительство в суде | `Scale` | 15 000 ₽ | month
- `real-estate-legal` — Сопровождение сделок с недвижимостью | `Home` | 12 000 ₽ | month

##### L2 — Бухгалтерия и налоги `accounting` — `Calculator`
- `self-employed-setup` — Открытие самозанятости | `UserCheck` | 1 500 ₽ | urgent
- `ip-registration` — Регистрация ИП | `FileText` | 3 500 ₽ | week
- `bookkeeping` — Бухгалтерское обслуживание | `Calculator` | 5 000 ₽/мес | week
- `tax-declaration` — Декларация 3-НДФЛ | `FileText` | 2 500 ₽ | week

##### L2 — Переводы и нотариус `translation` — `Languages`
- `translation-docs` — Перевод документов | `FileText` | 500 ₽/стр | week
- `notary-prep` — Помощь с нотариальными делами | `FileText` | 1 500 ₽ | week

##### L2 — HR и рекрутинг `hr` — `Users`
- `hiring` — Подбор персонала | `Users` | 8 000 ₽ | month
- `hr-consult` — Консультация по кадрам | `Users` | 2 500 ₽ | week

##### L2 — Страхование `insurance` — `Shield`
- `osago` — Оформление ОСАГО | `Car` | 500 ₽ | urgent
- `kasko` — КАСКО | `Car` | 1 500 ₽ | week
- `property-insurance` — Страхование жилья | `Home` | 1 500 ₽ | week
- `health-insurance` — ДМС | `Stethoscope` | 1 500 ₽ | week

---

#### L1.9 — IT и цифровое `it-digital` — `Monitor`

##### L2 — Компьютерная помощь `computer-help` — `Laptop`
- `windows-setup` — Установка Windows / macOS | `Monitor` | 1 500 ₽ | urgent
- `virus-removal` — Удаление вирусов | `Bug` | 1 500 ₽ | urgent
- `data-recovery` — Восстановление данных | `Database` | 5 000 ₽ | urgent
- `printer-setup` — Настройка принтера / сети | `Printer` | 1 500 ₽ | week
- `pc-repair` — Ремонт компьютера / ноутбука | `Laptop` | 2 500 ₽ | week

##### L2 — Разработка и сайты `dev-sites` — `Code`
- `landing-page` — Landing / сайт-визитка | `Layout` | 25 000 ₽ | month
- `online-store` — Интернет-магазин | `ShoppingCart` | 80 000 ₽ | month
- `mobile-app` — Мобильное приложение | `Smartphone` | 200 000 ₽ | month
- `seo` — SEO продвижение | `TrendingUp` | 15 000 ₽/мес | month
- `crm-setup` — Настройка CRM / автоматизации | `Cog` | 25 000 ₽ | month

##### L2 — SMM и реклама `marketing` — `Megaphone`
- `smm` — Ведение соцсетей | `Instagram` | 15 000 ₽/мес | month
- `targeting` — Таргетированная реклама | `Target` | 12 000 ₽ | week
- `branding` — Брендинг / логотип | `Palette` | 15 000 ₽ | month

##### L2 — Дизайн `design` — `Palette`
- `interior-design` — Дизайн интерьера | `Home` | 60 000 ₽ | month
- `graphic-design` — Графический дизайн / полиграфия | `Palette` | 3 500 ₽ | week
- `3d-vis` — 3D-визуализация | `Box` | 25 000 ₽ | month

---

#### L1.10 — Личный сервис `personal-services` — `Heart`

##### L2 — Уход за детьми `childcare` — `Baby`
- `nanny-hourly` — Няня почасовая | `Baby` | 350 ₽/час | week
- `nanny-fulltime` — Няня постоянная | `Baby` | 35 000 ₽/мес | month
- `governess` — Гувернантка | `User` | 50 000 ₽/мес | month
- `nanny-evening` — Няня на вечер | `Baby` | 500 ₽/час | urgent

##### L2 — Уход за пожилыми `eldercare` — `Heart`
- `caregiver-hourly` — Сиделка почасовая | `Heart` | 250 ₽/час | week
- `caregiver-fulltime` — Сиделка с проживанием | `Heart` | 40 000 ₽/мес | month
- `caregiver-hospital` — Сиделка в больнице | `Heart` | 1 500 ₽/смена | urgent

##### L2 — Психология и коучинг `psychology` — `Brain`
- `psychologist` — Психолог | `Brain` | 2 500 ₽/час | week
- `family-counseling` — Семейный психолог | `Heart` | 3 500 ₽/час | week
- `child-psychologist` — Детский психолог | `Baby` | 2 500 ₽/час | week
- `coach` — Коуч | `Target` | 3 500 ₽/час | week

##### L2 — Швейные услуги `sewing` — `Scissors`
- `clothes-repair` — Ремонт одежды | `Shirt` | 500 ₽ | week
- `clothes-tailoring` — Подгонка по фигуре | `Shirt` | 800 ₽ | week
- `custom-sewing` — Пошив на заказ | `Scissors` | 3 500 ₽ | month
- `national-clothes` — Национальная одежда | `Shirt` | 8 000 ₽ | month

##### L2 — Зооуслуги `pet-services` — `PawPrint`
- `pet-grooming` — Груминг (стрижка собак / кошек) | `PawPrint` | 2 500 ₽ | week
- `pet-walking` — Выгул собак | `PawPrint` | 300 ₽ | urgent
- `pet-sitting` — Передержка | `PawPrint` | 500 ₽/день | week
- `vet-home` — Ветеринар на дом | `Stethoscope` | 1 500 ₽ | urgent

##### L2 — Религиозные / ритуальные услуги `religious-services` — `BookOpen`
- `mawlid-host` — Проведение мовлида | `BookOpen` | 5 000 ₽ | week
- `imam-service` — Имам на дом (молитва, обряд) | `BookOpen` | 3 500 ₽ | urgent
- `tahara` — Подготовка к погребению (тахарат) | `BookOpen` | по договорённости | urgent
- `quran-recitation` — Чтение Корана на меджлисе | `BookOpen` | 3 500 ₽ | week

##### L2 — Услуги для бизнеса `b2b-services` — `Building2`
- `office-cleaning` — Клининг офисов | `Sparkles` | 8 000 ₽/мес | month
- `office-it` — IT-обслуживание организаций | `Server` | 15 000 ₽/мес | month

##### L2 — Эзотерика и нетрадиционное (с осторожностью) `alt-services` — `Sparkles`
- `astrology` — Астрология / нумерология | `Sparkles` | 2 500 ₽ | week
- *Примечание:* категория спорная для региона. По умолчанию **скрыта** на старте, включаем только если есть спрос. Все эзотерики проходят отдельную модерацию.

##### L2 — Услуги для свадеб (зонтичная) `wedding-services-umbrella` — `PartyPopper`
- Это не отдельная категория, а **тег-зонтик** для агрегации. Свадебный фотограф, ведущий, кейтеринг и т.д. могут добавить тег «работаю со свадьбами» и попасть в специальный раздел «Свадьба под ключ».

##### L2 — Услуги по дому общие (ничего из выше) `other-personal` — `MoreHorizontal`
- `other` — Прочее (с обязательным текстовым описанием) | `MoreHorizontal` | по договорённости | week
- **Назначение:** клапан для услуг, не подпавших под каталог. Регулярно ревьюится — если в `other` накапливается ≥20 одинаковых запросов («помощь с переездом скота», например), это сигнал создать новую L2.

---

### 1.4. Заметки по дереву

- **Сезонные категории** (свадьбы, газоны, кондиционеры) — помечаются полем `seasonality` (4 значения: `all-year` / `summer` / `winter` / `wedding-season`). Не скрываются вне сезона, но в листинге понижается.
- **Лицензируемые услуги** (электробезопасность, газ, медицина) — отдельным флагом `requires_license` на L3-уровне. Мастер не сможет включить эту услугу без загрузки документа на верификацию.
- **Категории-обёртки для свадеб:** свадьба = не категория, а **межкатегорийный тег** (см. §7).

---

## Раздел 2. Поля профиля мастера

### 2.1. Универсальные поля (одинаковые для всех мастеров)

#### A1. Обязательные при активации профиля (🔴)

| Поле | Тип | Валидация | Зачем |
|---|---|---|---|
| `phone` | string (E.164) | RU/Ингушетия (+7XXX...), подтверждён СМС | Идентификатор аккаунта, антифрод |
| `first_name` | string | 2-30 символов, кириллица/латиница | Базовое представление |
| `last_name` | string | 2-30 символов | Базовое представление |
| `avatar_url` | string (URL) | Фото с лицом, прошедшее модерацию | Доверие, узнаваемость |
| `city_id` | enum FK | Магас / Назрань / Сунжа / Малгобек / Карабулак / село (из справочника) | Локальный поиск |
| `categories` | array<L2_id> | min 1, max 5 (см. §4) | Что я делаю |
| `services` | array<L3_id> | min 1 (внутри выбранных L2) | Конкретные услуги |
| `pricing_mode` | enum | `per-hour` / `per-unit` / `negotiable` / `on-quote` | Как считается цена |
| `service_radius_km` | int | 0-100 | Куда выезжаю |
| `work_schedule` | object | Дни недели + часы; см. §5.9 PROJECT_MAP | Когда доступен |
| `accepted_tos` | bool | true при регистрации | Юридическое |

#### A2. Опциональные (🟡 — дают бейджи / приоритет)

| Поле | Тип | Зачем |
|---|---|---|
| `bio` | text (max 500) | «О себе» в карточке |
| `experience_years` | int (0-60) | Бейдж «5+ лет опыта» |
| `portfolio_photos` | array<photo> | Подробнее §6 |
| `intro_video_url` | string | Видео-визитка ≤60 сек |
| `languages` | array<enum> | Русский / Ингушский / Чеченский / Английский / Арабский / Турецкий |
| `has_tools` | bool | Бейдж «Со своим инструментом» |
| `has_transport` | bool | Бейдж «На машине» |
| `tax_status` | enum | Физлицо / Самозанятый / ИП / ООО |
| `inn` | string | Для бейджа «Самозанятый/ИП» |
| `team_size` | int | 1 = мастер-одиночка, 2-10 = бригада, 10+ = компания |
| `gender` | enum | Жен / Муж / не указано — для фильтров (бьюти и т.д.) |
| `birth_year` | int | Возраст (не показывается публично, для аналитики) |
| `social_links` | object | Telegram / Instagram / VK |
| `telegram_username` | string | Для уведомлений через Telegram-бот |
| `district` | string | Конкретный район/село |
| `geo_point` | point (PostGIS) | Точка дома/офиса (с разрешения, в радиусе размытия 500 м для публичных фильтров) |
| `home_clients_policy` | enum | `with-male-present` / `anytime` / `women-only` — для деликатных категорий |

#### A3. Автоматические / админские (🔴 невидимы пользователю на редактирование)

| Поле | Тип | Источник |
|---|---|---|
| `id` | uuid | Generated |
| `created_at` | timestamp | Auto |
| `updated_at` | timestamp | Auto trigger |
| `is_master` | bool | True после прохождения регистрации мастера |
| `is_client` | bool | По умолчанию true для всех |
| `master_status` | enum | `draft` / `pending` / `active` / `suspended` / `banned` |
| `verification_level` | enum | 1-5 звёзд, см. §5.2 PROJECT_MAP |
| `passport_doc_id` | uuid FK | Документ паспорта (зашифрованно, удаляется через 30 дней) |
| `rating_avg` | float | Кешированный (пересчёт триггером после нового отзыва) |
| `rating_count` | int | Кешированный |
| `closed_deals` | int | Сколько сделок закрыто |
| `last_active_at` | timestamp | Для бейджа «Был сегодня» |
| `referral_source` | string | Откуда пришёл (для аналитики) |
| `device_fingerprint` | string | Антифрод (1 устройство — 1 аккаунт) |
| `ip_country` | string | Для гео-блокировки нероссийского трафика |

---

### 2.2. Category-specific поля (по L2)

Подход: каждая L2-категория имеет **набор атрибутов** (`category_fields`). Они хранятся в `master_categories.attributes` JSONB. Подробнее в §8.

Ниже — основные категории. Расширяется по ходу.

#### Строительство и ремонт

**`general-construction`**
- `works_on_private_houses` (bool) — Работает в ИЖС
- `crew_size` (int 1-20) — Размер бригады
- `has_own_equipment` (bool) — Свой инструмент (бетономешалка, виброплита)
- `materials_supply` (enum: `client` / `master` / `both`) — Кто покупает материалы
- `objects_done` (int) — Количество завершённых объектов

**`finishing`**
- `specialization` (multi: плиточник / маляр / штукатур / обойщик / универсал)
- `works_with_decorative` (bool) — Декоративные покрытия (венецианка, фактурка)
- `min_area_m2` (int) — Минимальная площадь заказа

**`electrical`**
- `clearance_level` (enum: нет / 2 группа / 3 группа / 4 группа / 5 группа) — Допуск к электробезопасности 🚨 требует документ
- `works_with_panels` (bool) — Сборка щитов
- `works_with_smart_home` (bool) — Умный дом
- `emergency_service` (bool) — Аварийные выезды ночью

**`plumbing`**
- `gas_boiler_license` (bool) — Лицензия на газовое оборудование 🚨 требует документ
- `welding` (enum: нет / газовая / электро / аргон) — Опыт сварки
- `emergency_service` (bool) — Аварии 24/7
- `works_with_underfloor_heating` (bool) — Тёплые полы

**`windows-doors`**
- `materials` (multi: ПВХ / алюминий / дерево)
- `does_measurement` (bool) — Делает замер
- `produces_self` (bool) — Своё производство или перепродажа
- `installs_automation` (bool) — Автоматика

**`ceilings`**
- `types` (multi: натяжные / подвесные / гипсокартон)
- `multi-level` (bool) — Многоуровневые
- `with_lighting` (bool) — Со встроенной подсветкой

**`welding`**
- `weld_types` (multi: газовая / электро / аргон / полуавтомат)
- `mobile_unit` (bool) — Выездной аппарат
- `works_with_stainless` (bool) — Нержавейка

**`climate`**
- `brands_worked_with` (multi: Daikin / Mitsubishi / LG / Samsung / другие)
- `does_warranty_service` (bool) — Гарантийные ремонты

**`furniture`**
- `does_kitchens` (bool) — Кухни на заказ
- `does_wardrobes` (bool) — Шкафы-купе
- `delivery_included` (bool) — Доставка входит
- `cad_drawings` (bool) — Делает 3D-проект

**`handyman`**
- `min_order` (int) — Минимальный заказ в рублях
- `same_day` (bool) — Сегодня

#### Дом и быт

**`cleaning`**
- `team_size` (int)
- `uses_eco_chemicals` (bool) — Экосредства
- `has_equipment` (multi: пылесос / парогенератор / моющий пылесос / нет)
- `works_with_post-renovation` (bool) — Уборка после ремонта

**`laundry`**
- `pickup_delivery` (bool) — Забор/доставка
- `same_day_service` (bool) — В тот же день

**`disposal`**
- `truck_volume_m3` (int) — Объём кузова
- `loaders_included` (bool) — Грузчики включены

**`garden`**
- `equipment` (multi: газонокосилка / триммер / бензопила / автовышка)
- `does_design` (bool) — Делает проект

**`tv-internet`**
- `brands` (multi: Триколор / НТВ+ / МТС ТВ / др.)
- `cable_runs` (bool) — Тянет кабель сам

**`appliances`**
- `brands_serviced` (multi: Bosch / LG / Samsung / Indesit / Атлант / др.)
- `home_diagnostics_free` (bool) — Бесплатная диагностика на дому

#### Авто и техника

**`auto-service`**
- `car_brands` (multi: специализация — например LADA / VAZ / KIA / Toyota / универсал)
- `has_lift` (bool) — Подъёмник
- `has_diagnostic_scanner` (bool)
- `inn_workshop` (bool) — Работает в боксе с ИНН (vs гараж)

**`tire-service`**
- `wheel_sizes` (multi: R13-R16 / R17-R19 / R20+)
- `mobile_service` (bool) — Выездной шиномонтаж

**`body-paint`**
- `has_paint-booth` (bool) — Окрасочная камера
- `insurance_works` (bool) — По страховым кейсам

**`car-wash`**
- `mobile_service` (bool)
- `detailing_specialization` (bool) — Детейлинг

**`roadside`**
- `service_radius_km` (специфичный, до 200)
- `tools_carried` (multi: пускозарядное / насос / трос / запаска)

#### Перевозки

**`cargo`**
- `vehicle_type` (enum: Газель / Тент / Рефрижератор / Бортовой / Манипулятор)
- `capacity_tons` (decimal) — Грузоподъёмность
- `volume_m3` (int) — Объём
- `loaders_count` (int) — Сколько грузчиков
- `intercity_available` (bool) — Межгород

**`heavy-equipment`**
- `vehicle` (enum: Манипулятор / Экскаватор / Кран / Бульдозер / Самосвал / Автовышка)
- `arrow_capacity_tons` (decimal) — Если кран/манипулятор — грузоподъёмность стрелы
- `bucket_volume_m3` (decimal) — Если экскаватор

**`towing`**
- `evacuator_type` (enum: сдвижная платформа / частичная / полная)
- `max_weight_tons` (decimal)

#### Бьюти и здоровье

**`nails`**
- `at_home` (bool) — Принимает дома
- `mobile_service` (bool) — Выезд
- `salon_address` (string) — Если работает в салоне
- `sterilization_certificate` (bool) — Стерилизация 🚨 требует фото сертификата
- `gel_brands` (multi: OPI / CND / Kodi / др.)

**`lashes-brows`**
- `at_home` (bool)
- `mobile_service` (bool)
- `hypoallergenic_materials` (bool)

**`hair`**
- `gender_clients` (enum: жен / муж / детский / все)
- `does_weddings` (bool) — Свадебные причёски
- `at_home` (bool)
- `salon_address` (string)

**`cosmetology`**
- `medical_license` (bool) — Медлицензия 🚨 требует документ
- `injectables` (bool) — Делает инъекции
- `apparatus_procedures` (bool) — Аппаратные процедуры

**`massage`**
- `medical_license` (bool) — Медлицензия для лечебного 🚨
- `at_home` (bool)
- `for_kids` (bool)
- `for_pregnant` (bool)

**`stylist`**
- `wedding_specialization` (bool)
- `team_includes_hair` (bool) — Работает с парикмахером

**`home-medical`**
- `medical_license` (bool) 🚨 обязательно
- `medical_position` (enum: медсестра / врач / массажист)

#### Образование

**`school-subjects`**
- `grades` (multi: 1-4 / 5-9 / 10-11)
- `format` (multi: онлайн / у себя / у ученика)
- `group_lessons` (bool)

**`exam-prep`**
- `exam_subjects` (multi: математика / физика / русский / обществознание / биология / химия / история / информатика / литература / география / английский / профильная математика)
- `format` (multi)
- `student_results` (text) — Опыт (балы выпускников)

**`languages`**
- `language` (enum, см. список L3)
- `levels_taught` (multi: A0-A1 / A2-B1 / B2-C1 / C2)
- `goals` (multi: разговорный / грамматика / экзамен / детям)
- `format` (multi: онлайн / очно)
- `native_speaker` (bool)

**`religious-education`**
- `madrasah_diploma` (bool) — Окончил медресе
- `khafiz` (bool) — Знает Коран наизусть (для категории `quran-memorization`)
- `teaches_women_only` (bool)
- `teaches_men_only` (bool)
- `teaches_kids` (bool)

**`extra-education`**
- `instrument` (enum: для music — гитара / фортепиано / скрипка / гармонь / др.)
- `age_groups` (multi: дошкольники / 6-12 / подростки / взрослые)

**`sports-coach`**
- `sport` (enum)
- `certifications` (text)
- `home_visits` (bool)
- `group_training` (bool)

#### События

**`catering`**
- `min_guests` (int)
- `max_guests` (int)
- `cuisine_types` (multi: ингушская / кавказская / европейская / халяль)
- `halal_certified` (bool) 🚨 при заявке — фото сертификата
- `equipment_rental_included` (bool)

**`confectionery`**
- `min_order_kg` (decimal)
- `cake_types` (multi: бисквит / медовик / муссовый / др.)
- `fondant` (bool)
- `figures_3d` (bool)
- `lead_time_days` (int)

**`entertainment`**
- `language` (multi: русский / ингушский / арабский)
- `events_count` (int) — Сколько провёл
- `sound_equipment` (bool) — Со своим звуком

**`decor`**
- `min_budget` (int)
- `transport_included` (bool)

**`photo-video`**
- `camera_brand` (multi)
- `editing_included` (bool)
- `delivery_format` (multi: USB / облако / диск / фотокнига)
- `lead_time_days` (int)
- `drone_available` (bool)

**`rentals`**
- `delivery_to_event` (bool)
- `deposit_required` (int) — Залог

#### Бизнес

**`legal`**
- `specialization` (multi: гражданское / семейное / уголовное / арбитражное / трудовое / административное)
- `bar_member` (bool) — Адвокатская палата

**`accounting`**
- `cert_aical` (bool) — Аттестат проф. бухгалтера
- `business_types` (multi: ИП / ООО / самозанятые)

**`translation`**
- `language_pairs` (multi: ru-en / ru-ar / ru-tr / ru-de)
- `certified_translator` (bool)
- `notary_partnership` (bool)

#### IT

**`computer-help`**
- `home_visits` (bool)
- `same_day` (bool)
- `os_specialization` (multi: Windows / macOS / Linux / Android / iOS)

**`dev-sites`**
- `tech_stack` (multi: WordPress / Tilda / 1С-Битрикс / React / Next / Vue / Laravel / Django)
- `portfolio_url` (string)
- `min_budget` (int)

**`marketing`**
- `platforms` (multi: Instagram / VK / Telegram / TikTok / Yandex Direct / Google Ads)

**`design`**
- `software` (multi: Figma / Sketch / Photoshop / Illustrator / 3DS Max / SketchUp / AutoCAD)

#### Личный сервис

**`childcare`**
- `kids_age_groups` (multi: 0-1 / 1-3 / 3-7 / 7-12)
- `medical_education` (bool)
- `pedagogical_education` (bool)
- `with_overnight` (bool) — С ночёвкой
- `cooks_for_kids` (bool)

**`eldercare`**
- `medical_education` (bool)
- `with_lifting` (bool) — Может поднимать (лежачие)
- `with_overnight` (bool)
- `language` (multi: русский / ингушский / чеченский)

**`psychology`**
- `education_diploma` (bool) 🚨 требует документ
- `approach` (multi: КПТ / гештальт / системная / экзистенциальная)
- `online_only` (bool)
- `works_with_kids` (bool)
- `works_with_couples` (bool)

**`sewing`**
- `specialization` (multi: ремонт / пошив / национальная одежда / вечерние платья / шторы)
- `pickup_delivery` (bool)

**`pet-services`**
- `animal_types` (multi: собаки / кошки / птицы / грызуны)
- `for_aggressive_pets` (bool)

**`religious-services`**
- `imam_credentials` (bool) — Имам с подтверждением 🚨
- `language` (multi)

#### Универсальные правила для category-specific полей

- Поле `🚨 requires_document` = true → мастер не может включить этот бейдж/опцию без загрузки документа, документ уходит на ручную модерацию
- При мультикатегорийности (см. §4) — атрибуты хранятся per `master_categories`-row, т.е. **раздельно** для каждой L2 у одного мастера

---

## Раздел 3. Поля заказа (со стороны клиента)

### 3.1. Универсальные поля заказа

#### B1. Обязательные (🔴)

| Поле | Тип | Валидация |
|---|---|---|
| `client_id` | uuid FK | Из текущей сессии |
| `category_l2_id` | FK | Одна L2-категория |
| `service_l3_ids` | array<FK> | min 1, конкретные услуги внутри L2 |
| `title` | string | 10-100 симв. — короткое описание |
| `description` | text | 30-2000 симв. — что нужно |
| `city_id` | FK | Из справочника |
| `urgency` | enum | `urgent` (сегодня-завтра) / `week` / `month` / `flexible` |
| `contact_mode` | enum | `chat-only` / `phone-after-pick` / `phone-open` / `masked-call` |

#### B2. Опциональные (🟡)

| Поле | Тип | Зачем |
|---|---|---|
| `photos` | array<photo> до 10 | Что чинить/делать |
| `videos` | array<video> до 2 (≤30 сек каждое) | Подробнее показать |
| `address_exact` | text | Точный адрес — виден только выбранному мастеру |
| `geo_point` | point | Координаты — то же |
| `district` | string | Район — публичная часть |
| `budget_min` / `budget_max` | int | Вилка в рублях |
| `budget_mode` | enum | `up-to` / `range` / `negotiable` / `on-quote` |
| `executor_type` | enum | `solo` / `team` / `company` / `any` |
| `gender_filter` | enum | `any` / `women-only` / `men-only` — для бьюти, нянь и т.п. |
| `requires_tags` | array<enum> | tools / transport / verified / experience-3y+ / has-license / etc. |
| `social_filter` | enum | `any` / `same-district` / `with-vouchers` / `friends-of-friends` |
| `preferred_master_id` | uuid | Если клиент уже знает кого хочет (повторный заказ) |
| `is_anonymous` | bool | Скрыть имя клиента, показать «Заказчик из X» |

#### B3. Автоматические (🔴)

| Поле | Источник |
|---|---|
| `id`, `created_at`, `updated_at` | Auto |
| `status` | `draft` / `published` / `in-progress` / `completed` / `cancelled` / `disputed` |
| `picked_master_id` | После выбора отклика |
| `responses_count` | Cached |
| `views_count` | Cached |
| `last_response_at` | Cached |

### 3.2. Category-specific поля заказа

Для каждой L2-категории — свой набор подсказок и обязательных полей, которые клиент заполняет визардом.

Подход: `category_fields` имеет два списка — для **профиля мастера** и для **заказа**. Часто это одни и те же поля, но с разной обязательностью (для мастера — опц. бейдж, для заказа — обяз. указание «что нужно»).

Ниже — топовые категории.

#### Электрика (`electrical`)
- `what_exactly` (multi: розетка / выключатель / люстра / проводка / щит / поиск неисправности / тёплый пол)
- `apartment_type` (enum: квартира / частный дом / коммерция)
- `material_supply` (enum: есть / нужен с материалом)
- `urgency_reason` (text, опц.) — «нет света в части дома», «искрит» — помогает мастеру оценить срочность

#### Сантехника (`plumbing`)
- `what_exactly` (multi: смеситель / унитаз / ванна / стиральная / разводка / котёл / прочистка / отопление)
- `apartment_type` (enum)
- `is_emergency` (bool) — «затопило / прорыв / нет воды»
- `gas_equipment_involved` (bool)

#### Отделочные (`finishing`)
- `room_type` (enum: квартира / частный дом / коммерция / отдельная комната / весь объект)
- `area_m2` (int)
- `surface_type` (enum: стены / потолок / пол / все)
- `has_demolition_done` (bool) — Снос/подготовка уже сделана
- `materials_supply` (enum)

#### Кровля (`roof-*`)
- `roof_area_m2` (int)
- `roof_material_current` (enum: профлист / металлочерепица / шифер / мягкая)
- `roof_material_desired` (enum, если новый)
- `roof_pitch` (enum: плоская / односкатная / двускатная / сложная)

#### Грузоперевозки (`cargo`)
- `from_address` (text)
- `to_address` (text)
- `distance_km` (int — рассчитывается)
- `what_to_move` (text) — Что везти
- `volume_estimate` (enum: до 1 м³ / 1-3 м³ / 3-10 м³ / 10+ м³)
- `loaders_needed` (int)
- `fragile` (bool)
- `floor_from` / `floor_to` (int) — Этажность для грузчиков

#### Маникюр / бьюти (на дому)
- `services_needed` (multi из L3)
- `at_home_or_salon` (enum: у меня дома / у мастера / в салоне мастера)
- `urgency` — стандарт
- `event_type` (опц.: «на свадьбу», «на работу») — помогает мастеру понять стиль

#### Репетитор
- `student_grade` (int 1-11 или enum: дошкольник / студент / взрослый)
- `subject` (enum, см. список)
- `goal` (enum: подтянуть успеваемость / ОГЭ / ЕГЭ / поступление / олимпиада / для себя)
- `format` (enum: онлайн / у репетитора / у ученика)
- `frequency` (enum: 1 раз / 1 раз в неделю / 2 раза / больше)
- `current_level` (text) — Где сейчас ученик

#### Кейтеринг / банкеты
- `event_type` (enum: свадьба / день рождения / поминки / корпоратив / другое)
- `event_date` (date)
- `guests_count` (int)
- `cuisine` (multi: ингушская / кавказская / европейская)
- `halal_required` (bool)
- `venue` (enum: дома / зал / выезд)
- `dishes_count` (enum: 5-7 / 8-12 / 13+)

#### Фото/видео на свадьбу
- `event_date` (date)
- `event_duration_hours` (int)
- `coverage` (multi: подготовка / ЗАГС / банкет / съёмка дома)
- `delivery_format` (multi)
- `gender_filter` — часто важен (фотограф-женщина для женской половины)

#### Авто-СТО (заказ)
- `car_brand_model` (string)
- `year` (int)
- `problem_description` (text)
- `at_master_location_or_visit` (enum: к мастеру / выезд)

#### Кондитерская (торт)
- `event_date` (date)
- `weight_kg` (decimal)
- `style` (text + photo example)
- `flavor` (multi: бисквит / медовик / шоколад / др.)

#### Сиделки / няни
- `who_for` (enum: ребёнок / пожилой / лежачий)
- `age_of_charge` (int)
- `schedule` (enum: почасовая / днём / с ночёвкой / 24/7)
- `start_date` (date)
- `duration` (enum: разово / на месяц / постоянно)
- `medical_required` (bool)

---

## Раздел 4. Мультикатегорийный мастер

### 4.1. Решение

**Один аккаунт = один профиль мастера**, но мастер может **выбрать до 5 L2-категорий**. Лимит:
- 5 категорий **L2** на профиль
- Внутри каждой L2 — все доступные L3
- L1 не ограничены (но фактически 5 L2 распределяются обычно по 2-3 L1)

Обоснование лимита: мастер, заявляющий 10+ разноплановых категорий, — почти всегда низкокачественный или маркетинговый абуз. 5 — достаточно для реальных кейсов («электрик + сантехник + сварщик», «швея + кондитер + парикмахер на дому»), но не позволяет «всё подряд».

### 4.2. Структура данных

```
users                       — 1 запись
  └─ master_profiles        — 1 запись (если is_master = true)
       └─ master_categories — 1..5 записей (по одной на L2)
            ├─ pricing      — отдельный набор цен на L3 в этой L2
            ├─ attributes   — JSONB c category-specific полями этой L2
            ├─ rating_avg   — рейтинг ИМЕННО в этой L2
            ├─ rating_count
            └─ portfolio_tags — теги, какие портфолио-фото отнесены к этой L2
```

### 4.3. Конкретные правила и UX

**Профиль и портфолио:**
- Один общий профиль (аватар, имя, био, языки)
- Одна общая галерея портфолио, но **каждое фото имеет тег категорий** (до 3 тегов на фото). Фото маникюра не показывается в выдаче электриков.
- Краткое «о себе» — общее, но можно добавить **per-category описание** (до 200 симв.) — «как электрик: работаю с 2018 г.», «как сантехник: специализация — газовые котлы».

**Цены:**
- Раздельные. Для каждой L2 свой `pricing_mode` и список цен L3.

**График работы:**
- Один общий график (мастер не может «работать как электрик утром, как сантехник вечером» — это всё его время).
- Но: фильтр доступности «сегодня» использует общий график.

**Радиус выезда:**
- По умолчанию общий. Опционально — мастер может задать **per-category radius** (например, маникюр — только дом, электрика — выезжаю до 50 км).

**Отклики:**
- Когда мастер откликается на заказ — отклик **автоматически привязывается к L2 заказа**. Клиенту в карточке отклика показывается:
  - Фото и имя мастера
  - **Рейтинг ИМЕННО в этой L2** («4.8 в категории Электрика, 28 отзывов»)
  - Бейдж «многопрофильный мастер: ещё работает в X, Y» — опц., если клиенту захочется кликнуть
- Если у мастера несколько L2 пересекаются с одним заказом (редкий случай — клиент создал заказ с двумя L2; но мы запрещаем такое в визарде — один заказ = одна L2) — выбор автоматический по доминирующей L2 заказа.

**Рейтинг — раздельный по L2:**
- Это критично. Рейтинг 5 как электрик не означает рейтинг 5 как маникюрша.
- Считаем `master_categories.rating_avg` отдельно для каждой L2.
- В карточке мастера на главной — показываем «совокупный рейтинг» как взвешенное среднее по объёму закрытых сделок, но в выдаче по конкретной категории — только её рейтинг.

**Поиск:**
- Клиент ищет «электрика» — выдача только по `master_categories WHERE l2 = 'electrical'`. Мастер с тегом «электрика + швейные» появится, но в карточке будет только его электротехническая часть (фото, цены, рейтинг).
- В карточке мастера видно бейдж «Делает ещё: швейные, сантехника» — можно перейти в его другую «вкладку».

**Публичная карточка мастера — «вкладки по категориям»:**
- Если у мастера 1 категория — стандартная карточка.
- Если 2+ — табы вверху карточки («Электрика», «Сантехника», «Швея») — каждый таб переключает портфолио, цены, рейтинг.

**UX добавления категории:**
- В «Мой профиль → Мои услуги» кнопка «Добавить категорию» (если < 5).
- При попытке добавить 6-ю — модал «Вы уже работаете в 5 категориях. Чтобы добавить новую, удалите одну из текущих».

**Запрет на нерелевантные комбинации (мягкий):**
- Если мастер выбирает «Электрика + Маникюр + Кейтеринг» — это технически разрешено, но при первой публикации профиля админ-модератор получает флаг «нетипичная комбинация — проверить». Не блокируем, но рассматриваем.

---

## Раздел 5. Dual-role: клиент + мастер

### 5.1. Решение

**Один аккаунт, две роли.** В таблице `users`:
- `is_client` bool default true (все могут заказывать)
- `is_master` bool default false (стаёт true после прохождения регистрации мастера)

### 5.2. Почему один аккаунт, не два

| Аргумент | За один | За два |
|---|---|---|
| Простота входа | ✅ один логин, одна СМС | ❌ две регистрации |
| Маркетинг: «мастер заказывает у мастера» | ✅ естественно | ❌ нужно объяснять |
| Антифрод (1 телефон — 1 человек) | ✅ работает | ❌ обход |
| Раздельные приватности (мастер не видит, что я что-то заказывал) | ❌ нужно решать на уровне UI | ✅ просто |
| Раздельные рейтинги | ❌ нужно разделять в логике | ✅ независимые |

Выбор — **один аккаунт**. Аргументов за «один» больше. Приватность по dual-role решается в UI (см. ниже).

### 5.3. Переключение режимов

**UI-свитчер:**
- В хедере / в шторке (drawer) мобильного приложения — пилюля-переключатель `[ Клиент | Мастер ]`.
- Состояние хранится в `AsyncStorage` / `localStorage` (`active_role: client | master`).
- При первом входе после регистрации мастера — режим автоматически `master`.
- При первом входе обычного пользователя — режим `client`.
- При следующем входе — последний выбранный.

**Что меняет свитчер:**
- Главная (лента заказов для мастера vs каталог категорий для клиента)
- Bottom-tab labels («Мои отклики» vs «Мои заказы»)
- Профиль (просмотр «как мастер виден клиенту» vs «мой клиентский профиль»)

**Что НЕ меняет:**
- Чаты (общие)
- Уведомления (все приходят — но визуально разделены)
- Настройки
- Платежи / реквизиты

### 5.4. «Мои заказы» в dual-role

Раздел «Мои заказы» — **два таба**:
- **Я заказывал** — мои заказы как клиента
- **Я выполнял** — заказы, где я был исполнителем (master view)

Если `is_master = false` — таба «Я выполнял» не видно.

### 5.5. Уведомления

- Пуши имеют **роль-source**: `[Клиент]` или `[Мастер]` (визуальная метка)
- Звук/важность может быть настраиваема (push-настройки по типам)

Пример уведомлений в одном инбоксе:
- `[Мастер] Новая заявка по электрике в Назрани`
- `[Клиент] Мастер Адам откликнулся на ваш заказ`

### 5.6. Защита от абуза

**Мастер не может заказать сам у себя:**
- При создании заказа в категории, где сам мастер активен — он не получает уведомление о своём заказе (фильтр).
- Также его собственный заказ не отображается в его ленте мастера.

**Мастер не может откликнуться на свой заказ:**
- Сервер проверяет `order.client_id !== response.master_id`.

**Мастер не может оставить себе отзыв:**
- Сервер проверяет аналогично.

### 5.7. Рейтинги и отзывы в dual-role

**Раздельные:**
- `users.rating_as_client_avg` — отзывы мастеров о клиенте (опционально, см. §5.7 PROJECT_MAP)
- `master_categories.rating_avg` — отзывы клиентов о мастере (per category)

**Публичная карточка профиля:**
- Если человек **только клиент** — публичной карточки нет (только аватар в чате).
- Если человек **мастер** — публичная карточка содержит:
  - Стандартный профиль мастера
  - Бейдж «Был клиентом N раз» (опц., если ≥3 раза — для социального доказательства, что человек активен на платформе)
  - Рейтинг как клиента **НЕ показывается публично** мастерам, которые ещё не работали с ним (видно только тем, кто получил его заказ)

### 5.8. Edge cases dual-role

- **Бан клиента → мастера тоже банят?** Да. Бан = бан человека, а не роли.
- **Дезактивация мастер-профиля.** Можно через «Перейти в режим клиента и скрыть мастер-профиль». Аккаунт остаётся, мастер-профиль в статусе `suspended`.
- **Удаление мастер-роли.** Не предусмотрено soft-удаление с потерей истории. Только `is_master = false` + `master_status = 'archived'`.
- **Один человек — мастер по одной L2 и заказчик в другой.** Работает естественно. Электрик может заказать маникюр и наоборот.

---

## Раздел 6. Фотографии — техническая архитектура

### 6.1. Stack-решение

**Краткое решение:**
- **Хранение:** Supabase Storage (на старте, бесплатный 1 GB) → миграция на Cloudflare R2 при превышении 50 GB
- **Трансформации:** Supabase Image Transformations (встроены, но платные сверх Free → переключаемся на серверный ресайз через Edge Function + sharp при росте)
- **Клиентский ресайз:** `expo-image-manipulator` (mobile) + Canvas API (web) **ДО** загрузки
- **CDN:** Supabase Storage сам по себе CDN-обёрнут (Cloudflare front)
- **Доставка:** `expo-image` с `cachePolicy: 'memory-disk'`

### 6.2. Сравнение хранилищ

| Параметр | Supabase Storage | Cloudflare R2 | Backblaze B2 |
|---|---|---|---|
| Free tier | 1 GB | 10 GB | 10 GB |
| Storage $/GB/мес | $0.021 | **$0.015** | $0.006 (дешевле всех) |
| Egress $/GB | **$0.09** | **$0** (бесплатно) | $0.01 (с Cloudflare bandwidth alliance — бесплатно) |
| Image transforms | Встроены, но платные | Через Workers (платно) или Images ($5/мес за 100k) | Нет встроенных |
| Auth/RLS | Нативный | Через signed URLs | Через signed URLs |
| Сложность интеграции | Низкая | Средняя | Средняя |
| **Вердикт** | **На старте до 1000 мастеров** | **При выходе за 50 GB / SEO трафике** | **Для архива оригиналов (бэкап)** |

**Решение:** Supabase Storage на старте. Когда мастеров станет >2000 или suspicious egress — миграция оригиналов на R2 (с zero egress fee → критично для CDN-нагрузки от веб-каталога).

### 6.3. Форматы

**На входе принимаем:**
- JPEG, PNG — нативно
- HEIC (iPhone дефолт) — конвертируется на клиенте через `expo-image-manipulator.manipulateAsync({ format: 'jpeg' })`
- WebP — нативно
- **Отказ:** TIFF, BMP, RAW, GIF (для фото; для аватарки и портфолио GIF не имеет смысла; видео — отдельно)

**На выходе отдаём:**
- **WebP** (приоритет) для современных браузеров и RN (expo-image WebP supports)
- **AVIF** — пока пропускаем (нет универсальной поддержки в RN на старых Android)
- **JPEG fallback** — для legacy

### 6.4. Размеры (рендеры)

Каждое загруженное фото генерирует 4 рендера:

| Имя | Длинная сторона | Качество | Использование | Пример размера файла |
|---|---|---|---|---|
| `thumb` | 240 px | 75% | Аватары мини, превью в списке | ~10 KB |
| `card` | 480 px | 80% | Карточка мастера в feed, превью в галерее | ~40 KB |
| `detail` | 1080 px | 82% | Детальный просмотр в карточке | ~150 KB |
| `full` | 1920 px (max) | 85% | Полноэкранный просмотр, zoom | ~400 KB |

**Оригинал НЕ сохраняем.** При первой загрузке (на клиенте) сразу ресайз до 1920 px max и `JPEG quality 90`. Это убирает ситуацию «iPhone-фото 5 MB → загружаем как есть → 5 GB на 1000 фото».

### 6.5. Лимиты на пользователя

#### Вариант A. «Щедрый» — для первой 1000 мастеров

| Тип | Лимит | Макс. размер 1 фото | Итого / мастер | На 1000 мастеров |
|---|---|---|---|---|
| Аватар | 1 шт | 240 KB (после ресайза 480 px) | 240 KB | 240 MB |
| Портфолио | 50 шт | 600 KB (1920 px) | 30 MB | 30 GB |
| Видео-визитка | 1 шт ≤60 сек | 15 MB | 15 MB | 15 GB |
| Видео в портфолио | 0 шт | — | — | — |
| **Итого на мастера** | | | **~45 MB** | **~45 GB** |

Стоимость на Supabase: 45 GB × $0.021 = **$0.95/мес storage + ~$5-15/мес egress** (если трафик активный).

#### Вариант B. «Экономный» — для 10 000 мастеров

| Тип | Лимит | Макс. размер | Итого / мастер | На 10 000 мастеров |
|---|---|---|---|---|
| Аватар | 1 шт | 100 KB (после ресайза 240 px, q70) | 100 KB | 1 GB |
| Портфолио | 20 шт | 250 KB (1080 px, q75) | 5 MB | 50 GB |
| Видео-визитка | 1 шт ≤30 сек | 6 MB (640p, h.264 baseline) | 6 MB | 60 GB |
| **Итого на мастера** | | | **~11 MB** | **~111 GB** |

Стоимость на Cloudflare R2: 111 GB × $0.015 = **$1.67/мес storage + $0 egress** = **$1.67/мес общее**.

**Рекомендация:** **взять Вариант B с самого старта**, но позволять докупать «расширенный профиль» как 🟢 фичу будущего (мастер платит 200 ₽/мес — лимит 50 фото и видео).

### 6.6. Клиентский ресайз — критично для экономии

```ts
// pseudocode для mobile
import * as ImageManipulator from 'expo-image-manipulator';

async function prepareForUpload(uri: string) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],  // long side 1920
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      // EXIF removed automatically by manipulateAsync
    }
  );
  return result.uri;
}
```

На web — `canvas.toBlob('image/jpeg', 0.82)` после рисования из `<img>`.

**Важно:** EXIF (включая GPS-координаты) удаляется автоматически при ресайзе через manipulateAsync — это **обязательно** для приватности мастера (фото с домашним адресом — частая угроза). Дополнительно server-side прогоняем через `exif-strip` для гарантии.

### 6.7. Загрузка — UX

**Mobile:**
- `expo-image-picker` для выбора (или камера)
- Множественный выбор (макс. 20 за раз для портфолио)
- Прогресс-бар по каждому файлу
- Resumable upload через `tus-js-client` (Supabase Storage поддерживает TUS) — критично на медленных сетях Ингушетии

**Web:**
- Drag-n-drop зона + `<input type=file multiple>`
- Та же TUS-загрузка
- Preview в галерее перед коммитом

### 6.8. Модерация фото

**Авто (AI-Vision):**
- **NSFW:** Cloudflare Image AI (бесплатно при использовании R2) или AWS Rekognition Moderation ($1 / 1000 фото)
- **Документы (паспорт):** детектим присутствие документа в портфолио — блокируем (защита PII). OpenAI Vision $0.01 / image — но дорого для масштаба. Альтернатива — простой регэксп OCR через Tesseract на сервере.
- **Лица детей:** для категорий, где это уместно (нянь, бьюти для детей) — пропускаем. Для остальных — флаг на ручную модерацию.

**Ручная:**
- Все паспорта / документы верификации — 100% ручная.
- Жалобы пользователей на портфолио — ручная.

**Стоимость модерации на 1000 проверок:**
- NSFW через Rekognition: ~$1
- OCR-документ-детект: ~$0.5 (Tesseract self-hosted) или $5 (OpenAI Vision)
- **Итого:** ~$1.5 на 1000 фото при экономном варианте

### 6.9. CDN и lazy loading

**CDN:**
- Supabase Storage на Cloudflare-фронте (включено)
- Cache-Control: `public, max-age=31536000, immutable` для всех ресайзов (имя файла включает версию)

**Lazy loading в RN:**
- `FlashList` + `expo-image` с `placeholder={blurhash}` и `transition={200}`
- На вебе — нативный `loading="lazy"` через атрибут (expo-image это поддерживает)

**Blurhash:**
- Генерируется при первой загрузке через Edge Function + `blurhash` npm
- Хранится строкой ~30 символов в `photos.blurhash`
- Отдаётся вместе с метаданными — клиент рендерит размытие до загрузки

### 6.10. Видео

**Допускаем, но строго:**
- Видео-визитка мастера: 1 шт, ≤60 сек, ≤15 MB на Варианте A / ≤30 сек, ≤6 MB на Варианте B
- Видео в портфолио: 0 на старте (дорого), потом 🟢 платная фича

**Где хранить:**
- На старте — Supabase Storage (как файл)
- При росте — **Bunny Stream** ($0.005 / GB/мес + $0.005 / GB delivery) — намного дешевле Mux на нашем масштабе

**Транскодирование:**
- На клиенте через `expo-video-thumbnails` снимаем превью
- Серверно через Edge Function + ffmpeg-WASM — фоновая задача для конвертации в `h.264 baseline 720p`

**YouTube unlisted:**
- НЕ используем. Зависимость от внешнего сервиса, недоверенный UX (ссылка в РФ может тормозить).

### 6.11. Жалобы на фото

Кнопка «Пожаловаться на это фото» в галерее — варианты: чужое фото, неподходящий контент, документ, низкое качество. Жалоба попадает в очередь модерации.

### 6.12. Сводная стоимость инфры по фото (Вариант B)

| Статья | Цена/мес | Комментарий |
|---|---|---|
| R2 storage 111 GB | $1.67 | На 10 000 мастеров |
| R2 egress | $0 | Zero egress fee |
| Bunny Stream видео ~60 GB | $0.30 + $0.30 = $0.60 | Если включены |
| AI-модерация ~30 000 фото/мес | $50 | Если каждый мастер заливает 3 фото |
| **Итого** | **~$52/мес** | На 10 000 мастеров активных |

На 1000 мастеров — фактически $5-10/мес. Бюджетно реально.

---

## Раздел 7. Edge cases категорий и профилей

### 7.1. Мастер хочет добавить категорию, которой нет

**Решение:**
- Поле «Прочее» (`other-personal/other`) в каталоге — клапан для нестандартного.
- При выборе `other` мастер обязан описать в свободной форме (50-200 симв.).
- Раз в неделю админка генерирует отчёт «топ-20 текстов в `other`» — если что-то накапливается (например, 50 мастеров написали «прокат снаряжения») — заводим новую L2.
- Также форма «Предложить категорию» в личном кабинете мастера — отправляет тикет в админку.

### 7.2. Мастер заявляет 5+ категорий — абуз?

- Лимит 5 L2 = жёсткий потолок (см. §4).
- Если 4-5 категорий и совсем разные сферы (электрика + маникюр + кейтеринг + репетитор) — admin flag. Не блокируем, но в карточке появляется тонкая пометка «универсал».
- Алгоритм выдачи: при поиске «электрика» **мастер с 5 категориями ранжируется ниже** мастера с 1-2 категориями при равном рейтинге. Сигнал «специализация важна».

### 7.3. Сезонные категории

- Поле `seasonality` на L3.
- В каталоге **не скрываем**, но переставляем порядок (летом «кондиционеры» вверх, зимой — вниз).
- Уведомление мастера за месяц до сезона: «Скоро свадебный сезон — обновите портфолио».

### 7.4. Категории «под ключ» — поглощение

Реальная ситуация: «Стройка дома под ключ» включает в себя кучу L3. Мастер-бригадир заявляет L2 `general-construction` + `turnkey`, но фактически делает всё (электрика, сантехника, отделка).

**Решение:**
- Категория `turnkey` существует как отдельный L3 в `general-construction`.
- Мастер при выборе этой L3 в карточке получает бейдж «Делает под ключ».
- Клиенту-заказчику сложного объекта показываются такие мастера в **отдельном блоке** «Мастера под ключ» рядом с обычной выдачей.

### 7.5. Категория без мастеров в радиусе клиента

**UX:**
- В выдаче пусто → показываем:
  - «Пока в вашем районе нет мастеров по этой услуге»
  - «Расширить поиск до республики» (кнопка) — снимает фильтр района
  - «Уведомить меня, когда появится мастер» (кнопка) — записываем `wishlist_master_in_category` для этого пользователя

**С точки зрения мастеров:**
- В админке статистика «пустых категорий по районам» — формирует целевую рекрутинг-кампанию.

### 7.6. Миграция категорий через 2 года

Любая таксономия устаревает. План:
1. Все L1/L2/L3 имеют поле `is_active` bool.
2. Устаревшая категория = `is_active = false`. Не удаляется (старые заказы и профили на неё ссылаются).
3. Если категория **переименована** — оставляем старый id, меняем `name`/`slug`.
4. Если категория **расщеплена** (была одна, стала две) — миграция через ручной mapping в админке. Например, `auto-service` → разделяется на `auto-service-petrol` и `auto-service-diesel`. Старые мастера попадают в один из них (или оба) после ручного выбора, либо автоматически с уведомлением «Мы разделили категорию, проверьте свой профиль».
5. Если две категории **слиты** — переносим все master_categories с одного id на другой через миграцию + обновляем все ссылки в orders.

### 7.7. Роутинг заказа когда клиент выбрал неверную категорию

Кейс: клиент создал заказ в «Электрика» — но реально нужен «Электромонтаж в частном доме». Это всё ещё в L2 `electrical`, но L3 другой (`wiring-house` vs выбранный клиентом `outlet-replace`).

**Решение:**
- Визард при создании заказа **обязательно требует L3** (как минимум одну).
- При публикации заказа — фоновая ML-проверка текста описания vs выбранные L3. Если расхождение — клиенту показываем подсказку «Возможно, вы имели в виду: [список альтернатив]». Не блокируем, но советуем.
- Мастера, которые не делают `outlet-replace`, но делают `wiring-house`, всё равно получают заказ в ленте — фильтр по L2, не по L3.
- Сам отклик мастера может содержать поле «уточнение услуги» — мастер пишет «вы запросили замену розетки, но из описания вижу что нужна полная переразводка — могу сделать, цена X».

### 7.8. Региональная специфика Ингушетии

Категории, которых нет в обычных маркетплейсах, но важные здесь:

- **Чтение Корана / Хифз / Имам на дом** — отдельные L3 (включены в дерево, см. `religious-education`, `religious-services`).
- **Подготовка к погребению (тахарат)** — деликатно, включено в `religious-services`. Без публичных цен (по договорённости).
- **Ингушский язык как L3** — включено.
- **Национальная кухня** — отдельная категория `national-cuisine` в `catering`.
- **Поминальный стол** (`funeral-catering`) — отдельная L3, частая.
- **Гармонист** (`accordion`) — отдельная L3 в `entertainment`.
- **Свадьба под ключ** — зонтичный тег, не категория. Свадебный кортеж, фотограф, ведущий, кейтеринг могут отметить «работаю на свадьбах» — попадают в фильтр.
- **«Работает с женщинами / только с мужчинами»** — флаги `home_clients_policy`, `gender_clients`, `teaches_women_only` в category-specific.
- **«Халяль»** — флаг `halal_certified` для кейтеринга / мяса.

---

## Раздел 8. Архитектура БД (Postgres / Supabase)

### 8.1. Подход к category-specific полям — вердикт

Сравнение подходов:

| Подход | Плюсы | Минусы | Вердикт |
|---|---|---|---|
| **EAV** (`master_category_field_values` с триплетами master_id-field_id-value) | Гибкость, формальная схема | Много join'ов, медленные запросы, нет нативных типов | ❌ Нет |
| **Колонка-перколонка** (каждый атрибут — своя колонка в `master_profiles`) | Прозрачно, типизировано, индексировано | Десятки тысяч колонок при 60+ категориях × 10 полей; миграция при каждом изменении | ❌ Нет |
| **JSONB-колонка** в `master_categories.attributes` | Гибкость + Postgres-нативность, GIN-индексы по JSONB, нет миграций | Менее строгая типизация, валидация на app-слое | ✅ **ДА** |

**Решение:** **JSONB**. Это де-факто стандарт для категорий услуг в маркетплейсах на Postgres (Avito, Profi.ru — оба используют JSON/JSONB для атрибутов).

Дополнительно — **каталог метаполей** `category_fields` — справочник всех возможных полей по L2-категориям. Используется фронтом для рендера форм и валидации (Zod-схемы генерируются из этой таблицы).

### 8.2. Эскиз таблиц

```
┌─────────────────────────────────────────────────────────┐
│  users                                                  │
├─────────────────────────────────────────────────────────┤
│  id              uuid PK                                │
│  phone           text UNIQUE NOT NULL                   │
│  first_name      text                                   │
│  last_name       text                                   │
│  avatar_url      text                                   │
│  birth_year      int                                    │
│  gender          enum                                   │
│  city_id         FK → cities.id                         │
│  district        text                                   │
│  geo_point       geography(Point)                       │
│  is_client       bool DEFAULT true                      │
│  is_master       bool DEFAULT false                     │
│  rating_as_client_avg  numeric(2,1)                     │
│  rating_as_client_count int                             │
│  created_at      timestamptz                            │
│  updated_at      timestamptz                            │
│  last_active_at  timestamptz                            │
│  -- + поля антифрода (device, ip), статус (status enum)│
└─────────────────────────────────────────────────────────┘
            │ 1
            │
            │ 0..1
┌─────────────────────────────────────────────────────────┐
│  master_profiles                                        │
├─────────────────────────────────────────────────────────┤
│  user_id         uuid PK FK → users.id                  │
│  bio             text                                   │
│  experience_years int                                   │
│  has_tools       bool                                   │
│  has_transport   bool                                   │
│  tax_status      enum                                   │
│  inn             text                                   │
│  team_size       int                                    │
│  service_radius_km int                                  │
│  work_schedule   jsonb  -- {mon: [9,18], ...}            │
│  languages       text[]                                 │
│  home_clients_policy enum                               │
│  verification_level int (1-5)                           │
│  status          enum (draft|pending|active|...)        │
│  closed_deals    int  -- cached                         │
│  rating_overall_avg numeric  -- weighted across cats    │
│  rating_overall_count int                               │
│  intro_video_url text                                   │
│  created_at      timestamptz                            │
└─────────────────────────────────────────────────────────┘
            │ 1
            │
            │ 1..5
┌─────────────────────────────────────────────────────────┐
│  master_categories     -- многие-ко-многим master ↔ L2  │
├─────────────────────────────────────────────────────────┤
│  id              uuid PK                                │
│  master_id       FK → master_profiles.user_id           │
│  l2_id           FK → categories_l2.id                  │
│  l3_ids          uuid[]  -- какие L3 внутри L2 делает   │
│  pricing_mode    enum                                   │
│  pricing         jsonb  -- {[l3_id]: {min,max,unit}}    │
│  attributes      jsonb  -- category-specific поля       │
│  category_bio    text(200)  -- мини-био для этой кат-ии │
│  category_radius_km int  -- override общего радиуса     │
│  rating_avg      numeric(2,1)  -- per-category rating!  │
│  rating_count    int                                    │
│  closed_deals    int                                    │
│  UNIQUE(master_id, l2_id)                               │
└─────────────────────────────────────────────────────────┘
                          ↑
                          │ FK
┌─────────────────────────────────────────────────────────┐
│  categories_l1                                          │
├─────────────────────────────────────────────────────────┤
│  id, slug, name_ru, icon, cover_image_url, sort_order   │
└─────────────────────────────────────────────────────────┘
            │
            ↓
┌─────────────────────────────────────────────────────────┐
│  categories_l2                                          │
├─────────────────────────────────────────────────────────┤
│  id, l1_id, slug, name_ru, icon, sort_order,            │
│  is_active                                              │
└─────────────────────────────────────────────────────────┘
            │
            ↓
┌─────────────────────────────────────────────────────────┐
│  categories_l3                                          │
├─────────────────────────────────────────────────────────┤
│  id, l2_id, slug, name_ru, icon (опц.),                 │
│  avg_check_rub int, urgency_typical enum,               │
│  seasonality enum,                                      │
│  requires_license bool,                                 │
│  is_active bool                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  category_fields  -- метакаталог полей по L2             │
├─────────────────────────────────────────────────────────┤
│  id              uuid PK                                │
│  l2_id           FK → categories_l2.id                  │
│  field_key       text  -- 'clearance_level' и т.д.      │
│  field_label_ru  text                                   │
│  field_type      enum (bool|enum|int|text|multi-enum)   │
│  field_options   jsonb  -- варианты для enum            │
│  applies_to      enum (master|order|both)               │
│  required_for_master bool                               │
│  required_for_order  bool                               │
│  requires_document   bool  -- 🚨 для лицензий           │
│  sort_order      int                                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  orders                                                 │
├─────────────────────────────────────────────────────────┤
│  id              uuid PK                                │
│  client_id       FK → users.id                          │
│  l2_id           FK → categories_l2.id                  │
│  l3_ids          uuid[]                                 │
│  title           text                                   │
│  description     text                                   │
│  city_id         FK                                     │
│  district        text                                   │
│  address_exact   text  -- видно только выбранному       │
│  geo_point       geography(Point)                       │
│  urgency         enum                                   │
│  budget_min      int                                    │
│  budget_max      int                                    │
│  budget_mode     enum                                   │
│  executor_type   enum                                   │
│  gender_filter   enum                                   │
│  requires_tags   text[]                                 │
│  contact_mode    enum                                   │
│  is_anonymous    bool                                   │
│  status          enum                                   │
│  picked_master_id uuid FK                               │
│  attributes      jsonb  -- category-specific            │
│  responses_count int                                    │
│  views_count     int                                    │
│  created_at      timestamptz                            │
│  expires_at      timestamptz                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  order_responses                                        │
├─────────────────────────────────────────────────────────┤
│  id, order_id, master_id, master_category_id (точная L2)│
│  price_min, price_max, price_mode,                      │
│  lead_time, message text,                               │
│  attached_photos uuid[],                                │
│  status enum, created_at                                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  photos                                                 │
├─────────────────────────────────────────────────────────┤
│  id              uuid PK                                │
│  owner_id        uuid FK → users.id                     │
│  scope           enum (avatar|portfolio|order|response|review) │
│  master_category_ids uuid[]  -- к каким L2 относится фото│
│  storage_path    text                                   │
│  variants        jsonb  -- {thumb,card,detail,full}     │
│  blurhash        text                                   │
│  width, height   int                                    │
│  size_bytes      int                                    │
│  moderation_status enum (pending|approved|rejected)     │
│  created_at      timestamptz                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  reviews                                                │
├─────────────────────────────────────────────────────────┤
│  id, order_id, author_id, target_id,                    │
│  direction enum (client-to-master|master-to-client),    │
│  l2_id FK -- категория, в которой шла работа            │
│  rating int (1-5),                                      │
│  text text,                                             │
│  photos uuid[],                                         │
│  reply_text text, reply_at timestamptz,                 │
│  status enum (visible|hidden|pending), created_at       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  chats                                                  │
├─────────────────────────────────────────────────────────┤
│  id, order_id (опц.),                                   │
│  participant_ids uuid[],                                │
│  last_message_at timestamptz, ...                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  vouchers   -- поручительства                            │
├─────────────────────────────────────────────────────────┤
│  id, voucher_user_id, vouched_master_id,                │
│  created_at, status                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  verification_documents                                 │
├─────────────────────────────────────────────────────────┤
│  id, user_id, doc_type enum,                            │
│  storage_path (зашифрованно),                           │
│  expires_at (auto-delete 30 days after approval),       │
│  status, reviewer_id, reviewed_at                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  cities                                                 │
│  id, name, region, is_active, sort_order                │
└─────────────────────────────────────────────────────────┘
```

### 8.3. Индексы (критичные)

- `users.phone` UNIQUE
- `users.city_id`, `users.geo_point` (GIST)
- `master_profiles.status`
- `master_categories.l2_id` + `master_categories.rating_avg DESC` (composite — для выдачи)
- `master_categories.attributes` GIN — для фильтров по category-specific
- `orders.l2_id` + `orders.status` + `orders.created_at DESC` (для ленты мастера)
- `orders.geo_point` GIST + `orders.city_id`
- `orders.attributes` GIN
- `photos.owner_id` + `photos.scope`
- `reviews.target_id` + `reviews.l2_id`

### 8.4. RLS (Row Level Security)

- `users` — пользователь видит только себя; публичные поля (avatar, имя, кас. мастер-карточки) видны всем
- `master_profiles` — публичная инфа доступна всем, редактирование только владельцем
- `orders` — клиент видит свои, мастер видит только если соответствует категории/радиусу
- `order_responses` — клиент видит отклики на свои заказы; мастер видит свои отклики; админ видит всё
- `verification_documents` — только владелец + админ
- `reviews` — видны всем (после прохождения модерации `status = visible`)
- `chats` / `messages` — только участники

### 8.5. Замечания по JSONB

- Валидация JSONB на стороне приложения через **Zod-схемы**, генерируемые из `category_fields`.
- Можно дополнительно — Postgres CHECK constraints (например, `CHECK (attributes ? 'required_field')`), но проще держать в app.
- GIN-индекс по `attributes` для быстрых фильтров вида `WHERE attributes @> '{"gas_boiler_license": true}'`.
- Миграция при добавлении поля = только обновление `category_fields` (метакаталог) + обновление фронт-формы. Никаких ALTER TABLE.

### 8.6. Шардинг/масштаб (на будущее)

При >100k мастеров можно:
- Партиционировать `orders` по `created_at` (месяц)
- Партиционировать `photos` по `created_at` (квартал)
- Read-replica для каталога и поиска

На старте — стандартный Supabase Postgres, всё в одной инстанции. До 50k мастеров проблем не будет.

---

## Раздел 9. Финальная сводка решений

| Вопрос | Решение |
|---|---|
| Кол-во уровней категорий | 3 (L1=10, L2=64, L3≈290) |
| Где живут category-specific поля | JSONB в `master_categories.attributes` и `orders.attributes`. Метакаталог в `category_fields`. |
| Сколько L2-категорий на одного мастера | До 5 |
| Один аккаунт для клиента+мастера | Да, один. Свитчер режимов в UI. |
| Рейтинг мастера | Раздельный по L2 + общий взвешенный |
| Портфолио мультикатегорийного | Общая галерея с тегами L2 |
| Хранение фото на старте | Supabase Storage |
| Хранение фото при росте | Cloudflare R2 |
| Размеры рендеров | thumb 240 / card 480 / detail 1080 / full 1920 |
| Видео | На старте — только видео-визитка 60 сек ≤15 MB |
| Модерация фото | AI (NSFW + doc-detect) + ручная для документов |
| Лимит фото портфолио | 20 в Варианте B (рекомендуем) / 50 в Варианте A |
| Стоимость storage на 10k мастеров | ~$50/мес (с модерацией) |

---

*Документ живой. Пересмотр — после первой 1000 мастеров. Перед запуском — пройтись с продактом по 1.3 (дерево) и зафиксировать словарь как seed-данные для миграции.*
