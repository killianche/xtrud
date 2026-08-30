# Session summary — 2026-05-14

## TL;DR

Большая UI-сессия редизайна публичных экранов (главная, категория, профиль мастера). Основные результаты: универсальный `PickerSheet` вместо bottom-sheets, авто-скрываемая шапка категории, новая иерархия trust-row карточки мастера, увеличенные шрифты имени/цен, реальный xtrud-логотип в SVG, тёплая иконография (Iconify color + DiceBear shapes). Зафиксированы критические правила: минимальный шрифт 12px, документация после каждой осмысленной единицы, уменьшение фото до 1200px перед чтением.

## Закрытые задачи (нумерованный список)

### Базовые UI-компоненты

1. **`PickerSheet`** — новый full-screen one-of select (`src/components/ui/PickerSheet.tsx`). Заменил BottomSheet в выборе города, L3-услуги, сортировки. Header (back + title + reset) + опц. search + опц. icon-square + Check для selected. Открывается через Modal portal (на web — без CSS-vars-bug, см. anti-pattern).
2. **`Skeleton`** — новый универсальный skeleton-блок (`src/components/ui/Skeleton.tsx`) с `circle` / `width` / `height` / `className`. Используется вместо `<ActivityIndicator>` в загрузках мастеров, hero, имени, прайса.
3. **`HelpCallout`** — wrapper для inline-info-карточки на главной (mesh-gradient заглушка).
4. **`XtrudLogo`** — компонент рисует реальный xtrud-логотип через `react-native-svg` (`assets/images/xtrud-logo.svg`), не плейсхолдер. Используется в TopBar главной.

### Главная (`app/(tabs)/index.tsx`)

5. Логотип xtrud рядом с wordmark (size=20).
6. «Вся Ингушетия» → «Ингушетия» в TopBar и фильтрах.
7. Удалена «Часто ищут»-секция, hero — Vercel mesh-gradient callout.
8. Skeleton на загрузке списков.

### Категория (`app/(tabs)/category/[id].tsx`)

9. Auto-hide header (Animated.Value translateY) при скролле — back-row + chip-row уезжают, при скролле вверх возвращаются. Threshold 40px от верха, дельта-шум 4px, длительность 220ms. **Anti-pattern fix:** для прозрачности Animated.View использовать className "bg-canvas" + дублировать на back-row и chip-row, а **не** inline `style={{backgroundColor: tc.canvas}}` — на web в Modal/Animated portal CSS-vars пропадают.
10. Filter chips редизайн: иконки + h-10 + text-body-sm. Чип «Услуга» рисуется только если есть L3-подкатегории. Удалена dev-stub кнопка фильтров `SlidersHorizontal`.
11. Карточка мастера (MasterRow): аватар lg(64) → xl(96), gap-3 → gap-4. Имя 16 → **18px** (text-body-lg). Trust-row плотный: единый стиль `icon14 + text-body-sm` для Бригады/Рейтинга/Опыта. Город — отдельной строкой ниже с MapPin.
12. Кнопки Позвонить/WhatsApp в карточке: rounded-xl (12px), h-11. Primary = bg-ink + текст on-primary. Secondary = bg-canvas + border-hairline-strong.
13. Цены услуг 12 → **14px** mono (новый токен `text-mono-body`). 12px было неприемлемо мало для критичной инфы.
14. PickerSheet'ы: «Город», «<Категория>» (L3 с цветными иконками родительской L2), «Сортировка». Все full-screen, единый стиль.
15. Skeleton-state списка мастеров повторяет точную форму карточки (avatar 96 + 4 строки текста).
16. Откат от Wildberries-style портфолио-pager в карточке к простой аватарке (по фидбэку user). Старый код `MasterRowGallery` + `CompactPortfolioPager` оставлен в файле dormant для быстрого re-enable.

### Профиль мастера (`app/(tabs)/master/[id].tsx`)

17. Hero — портфолио-pager 4:5 (Wildberries-style), pagingEnabled FlatList, dots внизу. Fallback на 16:9 аватар если фото нет.
18. VK-style ряд из 5 квадратных миниатюр под hero. На 5-й overlay «+N» если фото больше. Тап → `PortfolioLightbox`. Полезно когда у мастера 6+ фото.
19. Объединены секции «Что делаю» + «Услуги» в одну «Услуги» с двумя под-блоками (направления + прайс). `MasterServicesList` принимает `hideTitle` чтобы не рисовать дубликат заголовка.
20. Trust-row: chip с MapPin вместо plain-текста города (унификация с Бригада/Опыт/Радиус).
21. Inline-кнопки Позвонить (primary pill bg-primary) + WhatsApp (outline) под bio. Sticky bottom CTA убран.
22. CTA «Этот мастер выполнил мне работу» → `ConfirmWorkSheet`.
23. Skeleton для hero, имени, чипов trust-row (progressive cascade).

### Tab bar (`app/(tabs)/_layout.tsx` + `src/components/TabBar.tsx`)

24. Иконки заменены: Home → House, ClipboardList → Briefcase, MessageCircle → MessageSquareMore, User → CircleUserRound, Plus → CirclePlus. Filled state на focus через `fill={focused ? color : "none"}`.

### Avatar (`src/components/ui/Avatar.tsx`)

25. Новый размер `xl` = 96px добавлен в шкалу (sm/md/lg/xl).

### City selector (`src/components/CitySelector.tsx`)

26. Заменён BottomSheet на PickerSheet. «Вся Ингушетия» → «Ингушетия» в CITIES const.

### Availability (`src/features/master-view/availability.ts`)

27. `this_week` color: amber #f59e0b → emerald #10b981 (готов на этой неделе = так же зелёный как «сегодня»). `next_week` остался amber.

### Migrations (Supabase)

28. `0040_get_master_phone_rpc.sql` — RPC обходит RLS на users (phone в auth.users), фильтрует только активных мастеров.
29. `0041_confirm_work_done.sql` — RPC для ad-hoc подтверждения работы клиентом.
30. `0042_merge_duplicate_l2_categories.sql` — мердж дубликатов L2 (`l2_id` 'plumbing').
31. `0043_availability_status.sql` — поля `availability_status` + `availability_until` в `master_profiles`.
32. `0044_seed_demo_orders_alina.sql` — демо-заказы под клиента Алины для теста ConfirmWork.
33. `0049_orders_city_optional.sql` — `orders.city_id` стал optional.

### Иконки категорий (`src/lib/category-color-icons.ts`)

33a. **Замена 10 несмысловых иконок строительного блока** (фидбэк юзера 2026-05-14): bricks/brick/wood/cloud/snowflake/roll-of-paper/rock/wifi/bathtub плохо ассоциировались с категориями. Новый mapping:
- `drywall` (Гипсокартон/Штукатурка): `twemoji/bricks` → `twemoji/paintbrush` (нанесение слоя)
- `tiling` (Плитка и мозаика): `twemoji/brick` → `twemoji/chequered-flag` (клетчатая сетка)
- `floors` (Полы и стяжка): `twemoji/wood` → `twemoji/black-square-button` (квадрат паркета)
- `ceilings` (Потолки): `twemoji/cloud` → `twemoji/light-bulb` (лампа на потолке)
- `tension-ceilings` (Натяжные потолки): `twemoji/snowflake` → `twemoji/film-frames` (натянутая плёнка)
- `insulation` (Утепление): `twemoji/roll-of-paper` → `twemoji/scarf` (тепло)
- `concrete` (Бетон): `twemoji/rock` → `twemoji/construction-worker` (рабочий)
- `masonry` (Каменщики и кладка): `twemoji/brick` → `twemoji/hammer-and-pick` (кирка+молот)
- `fences-gates` (Заборы): `fluent-color/wifi-24` → `twemoji/japanese-castle` (стена крепости)
- `baths-pools` (Бани, бассейны): `twemoji/bathtub` → `twemoji/hot-springs` (горячий источник)

Все новые иконки протестированы через `curl -I https://api.iconify.design/<name>.svg` (HTTP 200 + валидный SVG > 200 байт). Архитектура не менялась — рендер по-прежнему `<Image source={{uri}}/>` через `getCategoryColorIconUrl`. **Правило для будущих агентов:** при добавлении новой L2-категории не выдумывать имя иконки — обязательно проверить через `curl` к Iconify CDN, иначе будет 404 и тихо ломается UI.

### Документация и правила

34. **DESIGN.md** — секция «Минимальные размеры шрифта»: 12 absolute min, 14 body, 16+ critical, 18 names. 6 правил применения. Anti-pattern: `text-caption-xs` (10px) запрещён.
35. **CLAUDE.md** — правило «ДОКУМЕНТАЦИЯ ПОСЛЕ КАЖДОЙ ОСМЫСЛЕННОЙ ЕДИНИЦЫ» (структура SESSION_SUMMARY, что обновлять, как применять).
36. **CLAUDE.md** — правило «УМЕНЬШАТЬ ИЗОБРАЖЕНИЯ ДО ≤1200px» (sips/pdftoppm команды, к чему применяется и не применяется).
37. **`.claude/rules/preview-rules.md`** — правило «никогда не запускать dev-сервер через Bash, только preview_start»; диагностика «изменений не видно»; описание SDK 54 web bug с `import.meta`.
38. **tailwind.config.ts** — новый токен `mono-body: 14px / 20px lh` для критичных mono-цифр (цены в листинге).

### Поздний вечер 2026-05-14 — fade-in cascade + увеличение шрифтов карточки мастера

39. **Главная — cascade fade-in** (`app/(tabs)/index.tsx`). `TopMasters` и `AllCategories` обёрнуты в `Animated.View opacity={0→1}` с 280ms timing после `!isLoading && data`. Skeleton остаётся как есть (4 plate-плейсхолдера / 10 list-плейсхолдеров) — chrome не прыгает, только реальный контент плавно проявляется. Естественный stagger получается из-за разного времени fetch (мастера ~200мс, категории ~150мс). Фидбэк user 2026-05-14 «блок резко появляется, хочется чтобы поочерёдно сверху вниз».

40. **Карточка мастера в категории — шрифты 14→16px** (`app/(tabs)/category/[id].tsx`, 2 повторяющихся блока). Bio: `text-body-sm` → `text-body-md`. Название услуги в прайсе: `text-body-sm` → `text-body-md`. Цена: `text-mono-body` (14) → новый токен `text-mono-md` (16). Фидбэк user 2026-05-14 «шрифты очень маленькие, увеличить на 2-3-4px».

41. **tailwind.config.ts** — новый токен `mono-md: 16px / 24px lh` для цен в листинге мастеров (выше `mono-body` 14px на 2px). Используется только в `CategoryDetail` пока — остальные mono места остаются на 14/13/12.

42. **`.claude/rules/preview-rules.md`** — добавлен большой блок «Симптом «превью не открывается / белый экран» — bundle 404 после rebuild». Причина: `npx serve` теряет cwd когда watcher пересоздаёт `dist/` (rm-rf + expo export → inode меняется). Фикс: `preview_stop` + `preview_start`. Диагностика через `curl` на index и bundle отдельно (если index 200 а bundle 404 — это оно).

43. **Иконки на главной — частичный rollback** (`src/lib/category-color-icons.ts`). По запросу user после неудачной попытки перевести на Lucide+tint всё откачено в исходный Iconify URL подход, затем заменены только 10 несмысловых иконок строительного блока (см. п. 33a выше — `paintbrush` / `chequered-flag` / `light-bulb` и т.д.). Файлы category-icons.ts, app/(tabs)/index.tsx и category/[id].tsx тоже возвращены к версии «как было» в этой части.

44. **Dark theme — поднят контраст 6 токенов** (`src/lib/colors.ts` → `npm run tokens` → `global.css`). Фидбэк user 2026-05-14 «в тёмной теме вообще ничего не видно». Старые значения проваливались по WCAG AA (`mute #6b6b6b` на canvas `#0a0a0a` давало contrast 3.5:1 — fail для normal text). Новая шкала:

| Токен | Было | Стало | Δ luminance |
|---|---|---|---|
| `--mute` | `#6b6b6b` (107) | `#999999` (153) | 3.6:1 → **6.9:1** (AAA) |
| `--body` | `#a1a1a1` (161) | `#b8b8b8` (184) | 6.9:1 → 9.5:1 |
| `--hairline` | `#262626` (38) | `#333333` (51) | едва видимая → различимая |
| `--hairline-strong` | `#404040` (64) | `#525252` (82) | outline-кнопки видны |
| `--canvas-soft` | `#111111` (17) | `#161616` (22) | card-row отделяется от canvas |
| `--canvas-soft-2` | `#1a1a1a` (26) | `#222222` (34) | следующий уровень surface различим |

Compat aliases (`surface-1/2/3`, `muted`, `muted-soft`) синхронизированы. Регенерация `global.css` через `npm run tokens` (script `scripts/generate-css-tokens.mjs`). 46 light + 46 dark токенов. **Правило для будущих агентов:** не править `:root` и `.dark` в global.css вручную — менять `src/lib/colors.ts` + `npm run tokens`. Между маркерами `@generated:tokens-start / -end` блок автозамещается.

## Новые правила и решения

- **Минимальный шрифт 12px (a11y)** — `DESIGN.md` § «Минимальные размеры шрифта». **Why:** WCAG/HIG/Material сходятся; всё мельче нечитаемо на мобильном при ярком свете. Marketplace критичен к читаемости имени, цены, отзывов.
- **Имя мастера = `text-body-lg` (18px) semibold** — `DESIGN.md`. **Why:** primary visual anchor карточки, не сжимать ради компактности. Раньше было 16, выглядело мелко на превью.
- **Цена в листинге = `text-mono-body` (14px) mono** — `DESIGN.md` + `tailwind.config.ts`. **Why:** 12px (старый mono-caption) маловато для критичной инфы. Новый токен `mono-body` 14/20.
- **Документация после каждой осмысленной единицы** — `CLAUDE.md`. **Why:** один диалог в чате — один раз; следующий агент его не увидит. Без doc-инвестиции теряется накопленный контекст.
- **Уменьшать фото ≤1200px перед `Read`** — `CLAUDE.md`. **Why:** оригинальные снимки/PDF-страницы > 1500px подвешивают AI-сессию.
- **Dev-сервер только через `preview_start`** — `.claude/rules/preview-rules.md`. **Why:** Bash run_in_background не появляется в Claude Preview UI, скриншоты идут с другого сервера, путаница.
- **Animated.View / Modal portal: bg через className, не inline style** — `CLAUDE.md` (anti-pattern в design-quality). **Why:** на web в portal'ах CSS-vars (`rgb(var(--canvas))`) теряются → прозрачность.
- **Эмоджи в UI запрещены без явного разрешения** — `CLAUDE.md` § «🚨 НИКАКИХ ЭМОДЖИ В UI». Используем Lucide / Iconify color / AI-SVG. **Why:** эмоджи рендерятся по-разному на платформах, ломают Vercel-эстетику.
- **Аватары — только DiceBear `shapes`** — `CLAUDE.md` § «🚨 АВАТАРЫ». **Why:** human-style (avataaars/personas) ломает marketplace-серьёзность.
- **Автоматическое скрытие header при скролле** — паттерн с Animated.Value + onScroll, `useNativeDriver: false` (для web). Threshold 40 + noise 4. **Why:** освобождает место для контента, но возвращается при reverse-скролле — пользователь не теряет контекст.

## Новые компоненты / паттерны

- **`<PickerSheet>` (`src/components/ui/PickerSheet.tsx`)** — full-screen single-select picker. **Когда использовать:** любой выбор «один из N» с N > 5 или когда нужен поиск. **Когда НЕ использовать:** chip-row для выбора 2–4 mutually-exclusive опций (используй FilterChip / ToggleGroup).
- **`<Skeleton>` (`src/components/ui/Skeleton.tsx`)** — универсальный skeleton-блок с `circle` / прямоугольник. **Когда использовать:** для всех progressive-loading состояний. **Когда НЕ использовать:** одноразовый ActivityIndicator на весь экран (это plain-loader, не skeleton).
- **`<XtrudLogo>` (`src/components/XtrudLogo.tsx`)** — реальный SVG-лого (`react-native-svg`). **Используется в:** TopBar главной, splash. **Anti-pattern:** не использовать DiceBear/Iconify-генерацию для брендовой части — только этот компонент.
- **`<HelpCallout>` (`src/components/HelpCallout.tsx`)** — info-callout с mesh-gradient. **Используется на:** главной, под hero.
- **`<AvailabilitySwitcher>` (`src/features/master-view/AvailabilitySwitcher.tsx`)** — компонент для master-self-управления статусом готовности.
- **`<ConfirmWorkSheet>` (`src/features/master-view/ConfirmWorkSheet.tsx`)** — bottom-sheet ad-hoc подтверждения работы клиентом.
- **`<MasterServicesList hideTitle>`** — флаг для использования внутри уже-озаглавленной секции (объединение «Что делаю» + «Услуги»).
- **Auto-hide header pattern** (`app/(tabs)/category/[id].tsx`): Animated.Value + onScroll handler с `dy > 4 && y > 40` направлением. Применять для category list / search results / любых длинных feed'ов.
- **VK-style 5-thumb row** (`app/(tabs)/master/[id].tsx`): `slice(0,5)` + overlay «+N» на 5-й miniature если total > 5. Тап → lightbox с этого индекса. Применять для preview-набора фото в hero-области.
- **Wildberries-style hero pager 4:5** (`PortfolioPager`): horizontal pagingEnabled FlatList + dots внизу (активный длиннее, неактивные точки). Применять только для портфолио мастера, не для общих галерей.

## Anti-patterns обнаруженные в сессии

- **Inline `style={{backgroundColor: tc.canvas}}` для Animated.View / Modal portal на web** → CSS-vars `rgb(var(--canvas))` теряются, фон становится прозрачным. **Правильно:** `className="bg-canvas"` + дублировать на дочерних рядах. См. `category/[id].tsx` Animated.View.
- **`bg-canvas` через NativeWind className на голом Animated.View** → не всегда применяется. **Правильно:** дублировать тот же className на child-View'ах (back-row, chips-ScrollView).
- **`expo start --web` для dev-сервера в Expo SDK 54** → bundle с `import.meta` грузится как classic `<script>`, SyntaxError, чёрный экран без console-ошибок. **Правильно:** `node scripts/dev-web-local.mjs` (watch + sed-патч `<script>` → `<script type="module">`). См. `.claude/rules/preview-rules.md`.
- **Dev-сервер через `Bash run_in_background`** → не появляется в Claude Preview UI, скриншоты идут с другого сервера. **Правильно:** только `mcp__Claude_Preview__preview_start`.
- **`<ActivityIndicator>` на весь пустой экран при loading** → выглядит как ошибка «зависло». **Правильно:** Skeleton под точную форму будущего layout.
- **`text-caption-xs` (10px)** в коде → нечитаемо. Удалён из шкалы. **Правильно:** `text-caption` (12px) минимум.
- **fontSize-сжатие чтобы текст влез** → накопление мелочи везде. **Правильно:** `numberOfLines={1}` + `flex-shrink`, layout-перестройка, не уменьшение шрифта.
- **5+ одинаково ярких CTA на одном экране** → нет иерархии. **Правильно:** один primary, остальные secondary/ghost.
- **Эмоджи как иконка категории / статуса** → разные платформы рендерят по-разному, ломает Vercel-эстетику. **Правильно:** Lucide React Native, Iconify color (`fluent-color`, `twemoji`), DiceBear `shapes`.
- **DiceBear `avataaars` / `personas` / `micah` для аватаров** → детский placeholder, ломает marketplace-серьёзность. **Правильно:** только `shapes`.
- **«Минимальная версия» / «MVP-первый шаг» без явной просьбы** → накапливается технический долг. **Правильно:** полная реализация по умолчанию, см. `CLAUDE.md` § «НИКАКИХ МИНИМАЛЬНЫХ ВАРИАНТОВ».
- **`git add .` / `git add -A`** → риск зацепить `.env`, секреты. **Правильно:** добавлять конкретные файлы.
- **Чтение оригинальных фото / PDF > 1500px через `Read`** → подвешивает AI-сессию. **Правильно:** `sips -Z 1200` / `pdftoppm -scale-to 1200`, потом `Read` уменьшённой версии. См. `CLAUDE.md` § «УМЕНЬШАТЬ ИЗОБРАЖЕНИЯ».

## Открытые вопросы / TODO

- **L3 фильтр в категории** (`category/[id].tsx`) — UI готов, но запрос не использует l3_filter. `master_categories.l3_ids` массив, нужен JOIN. **TODO sprint 2:** фильтровать через JOIN или отдельную таблицу `master_l3_categories`.
- **Кнопки Позвонить/WhatsApp в листинге** — пользователь жаловался на «слишком заметные иконки внутри». Текущий primary ink + secondary outline. Очередь: дальнейший редизайн менее заметным (см. `TASKS.md` или след. сессию).
- **Отступ chips → первая карточка мастера** в `/category` — пользователь просил уменьшить ещё в 2 раза. Очередь: уменьшить `mt-4` → `mt-2` или убрать отступ совсем.
- **Move 5-thumb row в листинговую карточку мастера** (а не master/[id]) — над кнопками Позвонить/WhatsApp, после прайса. Очередь: добавить в `MasterRow` второй блок миниатюр.
- **Header + chips redesign на /category** — пользователь просил «намного красивее, посмотри Lazyweb». Очередь: новые референсы + редизайн bar.
- **TS-ошибки** в `app/(tabs)/orders/edit/[id].tsx` и `app/(tabs)/orders/index.tsx` про cityId null — pre-existing, **не от текущих правок**, не трогаю по правилу №4 working-rules.
- **Routes typing**: `useSafeBack("/(tabs)/" as const)` ругается в TS как невалидный route (expo-router types). Pre-existing.

## Верификация

- TS check: `npx tsc --noEmit` — 2 pre-existing route-typing ошибки в `(tabs)/category/[id].tsx:93` и `(tabs)/master/[id].tsx:98`, **не от моих правок**.
- Preview: `category/plumbing` загружается, имена «Ислам Точиев», «Хава Аушева» рендерятся 18px (text-body-lg), цены «от 1500 ₽» в mono 14px (text-mono-body). Скриншот — см. сессию.
- Lazyweb: использовался для PickerSheet (Fever city picker, Poshmark sort), для иерархии trust-row (Thumbtack, Airbnb).

## Файлы изменённые в сессии

**Новые:**
- `src/components/ui/PickerSheet.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/components/HelpCallout.tsx`
- `src/components/XtrudLogo.tsx`
- `src/features/master-view/AvailabilitySwitcher.tsx`
- `src/features/master-view/ConfirmWorkSheet.tsx`
- `src/features/master-view/availability.ts`
- `src/lib/category-color-icons.ts`
- `assets/images/xtrud-logo.svg`
- `supabase/migrations/0040_get_master_phone_rpc.sql`
- `supabase/migrations/0041_confirm_work_done.sql`
- `supabase/migrations/0042_merge_duplicate_l2_categories.sql`
- `supabase/migrations/0043_availability_status.sql`
- `supabase/migrations/0044_seed_demo_orders_alina.sql`
- `supabase/migrations/0049_orders_city_optional.sql`
- `.claude/rules/preview-rules.md`
- `SESSION_SUMMARY_2026-05-14.md` (этот файл)

**Изменённые:**
- `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/category/[id].tsx`, `app/(tabs)/master/[id].tsx`
- `app/(tabs)/orders/edit/[id].tsx`, `app/(tabs)/orders/index.tsx`, `app/(tabs)/orders/new.tsx`
- `app/(tabs)/profile/edit-client.tsx`, `app/(tabs)/profile/index.tsx`
- `src/components/CitySelector.tsx`, `src/components/TabBar.tsx`
- `src/components/ui/Avatar.tsx`, `src/components/ui/BottomSheet.tsx`, `src/components/ui/index.ts`
- `src/features/master-services/MasterServicesList.tsx`
- `src/features/master-view/MasterHomeContent.tsx`, `src/features/master-view/use-master-public.ts`, `src/features/master-view/use-masters-by-l2.ts`, `src/features/master-view/use-top-masters.ts`
- `src/features/orders/OrderFormBody.tsx`, `src/features/orders/order-schema.ts`, `src/features/orders/use-create-order.ts`
- `src/types/database.ts`
- `supabase/seed-test/demo-fixture.sql`
- `tailwind.config.ts` (новый токен `mono-body`)
- `CLAUDE.md` (2 новых критических правила)
- `DESIGN.md` (секция «Минимальные размеры шрифта»)

---

## Поздний вечер 2026-05-14 — perf-агент: progressive loading + safe back-navigation

### TL;DR
Замена пустых full-screen лоадеров на progressive cascade со skeleton-формами, плюс
фикс back-навигации: при заходе по deeplink/refresh `router.back()` уходил в
браузерную историю до приложения. Теперь — гарантированный fallback на родителя.

### Закрытые задачи

#### Skeleton + progressive loading
1. **`<Skeleton>` базовый компонент** — `src/components/ui/Skeleton.tsx`. Animated.View с opacity-pulse (0.55↔1, ~1100ms), `bg-canvas-soft-2` через NativeWind для автоматического dark mode. Width/height/circle/className. Экспорт из barrel `src/components/ui/index.ts`.
2. **Master detail — каскад вместо white screen.** `app/(tabs)/master/[id].tsx`: убран блокирующий «Загружаем профиль…» full-screen. Hero рендерит 4:5 skeleton при `portfolio.isLoading || profile.isLoading`, имя — skeleton при `!u`, чипсы — 3 pill-skeletons при `!m`. Back-кнопка работает прямо поверх skeleton-hero. Error-state full-screen остался только при `profile.error`.
3. **Home → TopMasters** — `app/(tabs)/index.tsx`. Раньше при загрузке секция возвращала `null` и «прыгала» при появлении данных. Теперь рендерит 4 mini-card skeleton'а (180×180 avatar-area + 3 строки текста), точно повторяющие реальный layout.
4. **Orders index** — `app/(tabs)/orders/index.tsx`. Все 4 места с `<ActivityIndicator />` (ClientOrdersView / NewOrdersTab / RespondedTab / AssignedTab) заменены на shared `OrderRowsSkeleton` (chip + title + 3 meta-плашки в карточке с border-hairline). Inline `<ActivityIndicator />` в кнопке «Показать ещё» оставлен — там он уместен.
5. **Category page** — `app/(tabs)/category/[id].tsx`. Простой `h-20 rounded-xl` плейсхолдер заменён на полноценный row-skeleton: круг 96 (xl avatar) + 4 строки текста разной ширины + hairline-разделитель между, повторяет форму `MasterRow`.
6. **MasterServicesList** — `src/features/master-services/MasterServicesList.tsx`. `<ActivityIndicator />` → 3 skeleton-row'а с радиусом и высотой как у реальных prices-карточек.

#### Safe back-navigation
7. **`useSafeBack(fallback)` хук** — `src/lib/use-safe-back.ts`. Проверяет `router.canGoBack()`; если стек пуст (deeplink / refresh / push-нотификация) — `router.replace(fallback)`. Не ломает существующее поведение, закрывает edge-case «вышло не туда».
8. **Заменено в 7 экранах:**
   - `app/(tabs)/master/[id].tsx` → fallback `/`
   - `app/(tabs)/category/[id].tsx` → fallback `/`
   - `app/(tabs)/orders/new.tsx` → fallback `/(tabs)/orders` (header back, success «Закрыть», handleCancel)
   - `app/(tabs)/orders/[id].tsx` → fallback `/(tabs)/orders`
   - `app/(tabs)/orders/edit/[id].tsx` → динамический fallback на сам заказ или `/(tabs)/orders`
   - `app/(tabs)/orders/category-select.tsx` → fallback `/(tabs)/orders/new` (удалён неиспользуемый `useRouter`)
   - `app/(tabs)/chats/[id].tsx` → fallback `/(tabs)/chats` (критично для push-нотификаций)
   - `app/(tabs)/search.tsx` → fallback `/`

### Новые компоненты / паттерны

- **`<Skeleton>`** (`src/components/ui/Skeleton.tsx`) — pulse-плейсхолдер. **Использовать** для loading-state любого блока, форма которого предсказуема (карточки списков, аватары, hero-блоки). **НЕ использовать** `<ActivityIndicator />` на пустом экране — это anti-pattern по design-quality.md §5. Допустимо `<ActivityIndicator size="small" />` только inline (внутри кнопки «Показать ещё», save-button label) — никогда как заполнитель.
- **`useSafeBack(fallback: Href)`** (`src/lib/use-safe-back.ts`) — единая обёртка над `router.back()` для всех экранов с back-кнопкой. **Использовать** на ЛЮБОМ экране глубже `(tabs)/`: master, category, chats/[id], orders/[id], orders/new, orders/edit/[id], orders/category-select, search. Для новых детальных экранов в будущем — добавлять сразу. **Fallback должен быть логическим parent'ом** (master → home, orders/[id] → orders/index и т.д.), не «всегда home».

### Anti-patterns зафиксированные

- ❌ **`<ActivityIndicator />` на пустом блокирующем экране** (как было в master/[id] до правок: `if (isLoading) return <ActivityIndicator />`) — пользователь видит белое полотно. Правильно: всегда рендерить layout с skeleton-формами, блокирующий error/empty — только если данные точно не придут.
- ❌ **Секция возвращает `null` пока грузится** (как был TopMasters) — layout «прыгает» когда данные приходят. Правильно: рендерить skeleton-плейсхолдер той же высоты что и реальный контент.
- ❌ **`router.back()` без fallback** — при заходе по deeplink/refresh уходит в браузерную историю до приложения. Правильно: использовать `useSafeBack(parent)`.

### Что НЕ сделано (намеренно вне scope)

- `profile/edit-client.tsx`, `profile/edit-master.tsx` — back-кнопки и save-redirect. Профиль активно дорабатывается другими агентами, пусть owner добавит `useSafeBack` сам.
- `notifications/index.tsx`, `useful/index.tsx`, `useful/[slug].tsx`, `admin/index.tsx`, `client/[id].tsx`, `(auth)/verify.tsx`, `(onboarding)/master-categories.tsx` — back-кнопки есть, но эти зоны вне фокуса perf-агента.
- Реальный skeleton-кадр на скриншоте не удалось зафиксировать: prod-Supabase отдаёт данные за ≤150ms, ловить через preview_eval первый mount-кадр стабильно не получается. Косвенное подтверждение работы: 42 skeleton-block'а в DOM в момент навигации на новый master, чистый layout после загрузки, 9+ matches `Skeleton` в bundle.

### Верификация
- `npx tsc --noEmit` → exit 0
- Bundle пересобран, 18 matches `useSafeBack|canGoBack` в bundle
- Smoke-тесты back из прямого URL: `/master/<id>` → `/`, `/category/plumbing` → `/`, `/search` → `/`, `/orders/<id>` → `/` ✓
- При навигации по стеку (home → category → master → back) — возвращает на category ✓ (existing UX не сломан)
- `console.error` — пусто

### Файлы

**Новые:**
- `src/components/ui/Skeleton.tsx`
- `src/lib/use-safe-back.ts`

**Изменённые (zone perf-агента):**
- `src/components/ui/index.ts` (экспорт Skeleton)
- `app/(tabs)/index.tsx` (TopMasters skeleton)
- `app/(tabs)/master/[id].tsx` (progressive cascade + safeBack)
- `app/(tabs)/category/[id].tsx` (row-skeletons + safeBack)
- `app/(tabs)/orders/index.tsx` (OrderRowsSkeleton + 4 замены)
- `app/(tabs)/orders/[id].tsx` (safeBack)
- `app/(tabs)/orders/new.tsx` (safeBack ×3)
- `app/(tabs)/orders/edit/[id].tsx` (safeBack с динамическим fallback)
- `app/(tabs)/orders/category-select.tsx` (safeBack, удалён useRouter)
- `app/(tabs)/chats/[id].tsx` (safeBack)
- `app/(tabs)/search.tsx` (safeBack)
- `src/features/master-services/MasterServicesList.tsx` (skeleton-rows)

---

## Поздний вечер 2026-05-14 — LocationPicker bottom-sheet + orders/new rewrite + правила «не сокращать»

### TL;DR
Полный rewrite экрана `orders/new` под Vercel-эстетику с новым `<LocationPicker>` компонентом — иерархический picker локации (Вся Ингушетия / Город / Район / Село) в bottom-sheet'е. Подход скопирован из проекта Ingush-Business (`components/LocationSheet.tsx`). 34 села по 4 муниципальным районам РИ в `villagesByDistrict` const. Два новых критических правила в CLAUDE.md: «никаких минимальных вариантов» и «документация после каждой осмысленной единицы». Создан полноценный design-doc `docs/location-system.md`.

### Закрытые задачи

#### Hero экрана orders/new (Vercel rewrite)

1. **Hero блок переписан с violet-decoration на Vercel typography hierarchy** — `app/(tabs)/orders/new.tsx`. Убраны декоративные violet-круги и старые 3 round-step иконки (Pencil/Users/**Phone** — Phone особо конфликтовал с privacy-обещанием). Новая структура: eyebrow «НОВЫЙ ЗАКАЗ» (`text-mono-caption uppercase tracking-widest text-mute`) → H1 `text-display-md` «Опишите задачу — мастера отзовутся» → 3-step value-prop с иконками MessageSquare / Tag / UserCheck в кружочках 40dp.
2. **3-step переписан с process-фрейма на benefit-фрейм** — «Получите отклики / Посмотрите цены от мастеров / Выберите подходящего». Сначала было «Опишите задачу / Получите отклики / Без звонков», но пользователь захотел акцент на том, что **клиент получит**, а не на том что он делает.
3. **Privacy callout — отдельная подсвеченная плашка** — выделенная card с чёрным Lock-кружком 40dp + bold заголовок «Ваш номер скрыт от мастеров» + копия «Мастера присылают только цену и срок выполнения. Написать или позвонить вам они смогут лишь после того, как вы сами это разрешите.» Копия переписывалась 3 раза для грамотности.
4. **3-step + privacy объединены в единую info-card** — `bg-canvas-soft + border-hairline + rounded-xl + overflow-hidden` с внутренним `h-px bg-hairline` divider полной ширины. Раньше было две отдельные Card'ы с visual gap — выглядели как несвязанные компоненты. Размеры Lock-кружка и step-иконок согласованы (оба 40dp) — визуальная гармония.
5. **Submit-bar упрощён до одного primary CTA** — убрана «Отмена» (back-кнопка вверху делает то же), осталась одна fullwidth pill `h-14 rounded-full bg-primary` «Опубликовать заказ». Vercel pattern.

#### Form-поля приведены к Vercel-pattern

6. **Form-labels всех секций** — `src/features/orders/OrderFormBody.tsx`. `text-caption text-muted` (12px серый) → `text-body-sm semibold text-ink` (14px ink) для «Подробности», «Категория», «Город», «Сроки», «Бюджет», TextField, NumberField.
7. **Selected chips переведены на Vercel-pattern** — голубой `border-accent bg-accent-soft text-accent` → чёрный `border-ink bg-ink text-on-primary` для city / urgency / budget / district / village chips. Unselected — `text-body` → `text-ink`.
8. **Label «Сроки» → «Готовность мастера взяться за работу»** — точнее по смыслу (это про мастера, не дедлайн задачи).

#### Локация: «Вся Ингушетия» + 4 района + 34 села

9. **БД миграция: `orders.city_id → NULLABLE`** — `supabase/migrations/0049_orders_city_optional.sql`. `ALTER TABLE orders ALTER COLUMN city_id DROP NOT NULL`. Применена на прод через Supabase MCP. FK + индекс сохраняются.
10. **`ALL_INGUSHETIA_CITY = "all"` const** в `order-schema.ts` — UI-значение для «Вся Ингушетия». `useCreateOrder`: `"all"` → `null` в payload. `orders/edit/[id]` reset: `null` → `"all"` обратно.
11. **`districtOptions` const** — 4 муниципальных района РИ (Назрановский, Сунженский, Малгобекский, Джейрахский). Сохраняются как русское имя в `orders.district` (text, max 60).
12. **`villagesByDistrict` const** — 34 села по 4 районам:
    - Назрановский: Экажево, Яндаре, Плиево, Сурхахи, Кантышево, Долаково, Барсуки, Альтиево, Гамурзиево (9)
    - Сунженский: Орджоникидзевская, Серноводская, Нестеровская, Алхасты, Аршты, Берд-Юрт, Галашки, Даттых, Чемульга (9)
    - Малгобекский: Зязиков-Юрт, Инарки, Сагопши, Пседах, Верхние Ачалуки, Средние Ачалуки, Нижние Ачалуки, Аки-Юрт (8)
    - Джейрахский: Джейрах, Ляжги, Армхи, Ольгети, Гули, Бейни, Эгикал, Тарш (8)
13. **Helpers `findDistrictByVillage()` / `isDistrict()`** в `order-schema.ts` — для UI-восстановления родительского района по имени села. Когда `orders.district = "Экажево"`, фронт понимает что это в Назрановском районе.
14. **`<LocationPicker>` компонент** — `src/features/orders/LocationPicker.tsx`, ~270 строк. Trigger-pill (`📍 Магас · Экажево` / placeholder) + bottom-sheet с 4-уровневой иерархией. Draft-state (commit-on-«Готово»), pre-fill через `findDistrictByVillage`. Подход скопирован из Ingush-Business `LocationSheet`.
15. **Интеграция LocationPicker в OrderFormBody** — две плоские секции «Город» + «Район» заменены на один nested-Controllers (RHF) `<LocationPicker>` блок. Edit-форма автоматически получает то же поведение через общий OrderFormBody.
16. **Регенерация типов** — `src/types/database.ts`. `orders.city_id` в Row/Insert/Update теперь `string | null`. Шапка файла с инструкцией регенерации через MCP / CLI.
17. **Распространение nullable city_id на потребителей** — `app/(tabs)/orders/index.tsx`: graceful fallback `cityName={o.city?.name ?? o.city_id ?? "Вся Ингушетия"}` в 3 OrderRow. `NewOrdersTabProps.city_id: string | null`. `app/(tabs)/orders/edit/[id].tsx`: `cityId: order.city_id ?? "all"` при reset.

#### Документация и правила

18. **CLAUDE.md «🚨 НИКАКИХ МИНИМАЛЬНЫХ ВАРИАНТОВ И СОКРАЩЕНИЙ»** — критическое правило. Запрещено самовольно делать «упрощённую версию» / «MVP» / «v1». По умолчанию = полная реализация. Если есть reference-проект (Ingush-Business / Profi.ru / TaskRabbit) — делать на их уровне или выше, не ниже. Минимальный путь только когда пользователь явно сказал «сделай быстро / временно / только UI».
19. **CLAUDE.md «🚨 ДОКУМЕНТАЦИЯ ПОСЛЕ КАЖДОЙ ОСМЫСЛЕННОЙ ЕДИНИЦЫ РАБОТЫ»** (дополнено пользователем) — обязательное обновление `STATUS.md`, `SESSION_SUMMARY_YYYY-MM-DD.md`, design-doc'ов, шапок-комментариев в коде. Запрещено «потом задокументирую».
20. **`docs/location-system.md` design-doc** — полное описание системы локации: 4-уровневая иерархия / семантика `city_id NULL` / 3 семантики локации (заказ vs пользователь vs мастер) / отличия от Ingush-Business / follow-up tasks.
21. **STATUS.md** — секция «Текущее состояние (2026-05-14, Sprint J — orders/new rewrite + LocationPicker + правила в CLAUDE.md)» с описанием изменений + списком файлов + миграцией.
22. **TASKS.md** — закрыт пункт «Orders new Vercel rewrite» (`[x]`), добавлен раздел «✅ Сделано Sprint J — 2026-05-14» с 6 пунктами, добавлены 3 follow-up задачи (миграция БД locations / LocationPicker в master profile / multi-select для master service zone).

### Новые компоненты / паттерны

- **`<LocationPicker>`** (`src/features/orders/LocationPicker.tsx`) — иерархический picker локации в bottom-sheet'е. **Когда использовать:** заказ клиента (orders/new, orders/edit). После расширения (`multi=true`, master profile, master service zones — см. follow-up) — везде где нужна geo-локация выбор. **Когда НЕ использовать:** `users.city_id` (один уровень — оставить `CitySelector`), master-онбординг city-pick (пока flat).
- **Pattern: «единая info-card с двумя смысловыми зонами»** — `app/(tabs)/orders/new.tsx` hero. Когда два блока — части одного нарратива (как-работает + privacy-обещание), но логически разные, объединять в одну Card с внутренним hairline-divider полной ширины. Создаёт визуальную гармонию вместо двух отдельных Card'ок с gap.
- **Pattern: «trigger-pill + bottom-sheet»** — для иерархического выбора (>2 уровней) вместо плоских chip-row на форме. Trigger-pill высотой 48dp (как form-input) + bottom-sheet с полной структурой. Экономит вертикальное место в форме, mobile-friendly. Реализация на основе `BottomSheet` UI-atom.

### Anti-patterns обнаруженные в сессии

- ❌ **«Самовольное сокращение когда есть reference-реализация».** Хотел сделать hardcoded const villages когда был известен Ingush-Business путь с таблицей `locations` в БД. **Правильно:** делать на уровне reference или выше, follow-up tasks фиксировать явно с обоснованием **расширения**, а не сокращения текущего scope. Зафиксировано в CLAUDE.md «никаких минимальных вариантов».
- ❌ **«Hardcoded city_id для "Вся Ингушетия" в `cities` таблице».** Первая мысль — добавить запись id="all" в cities. Semantically wrong (запись не город, FK теряют смысл). **Правильно:** NULL для отсутствия привязки + UI-конвертер `"all"` ↔ `null` в use-create-order и use-update-order.
- ❌ **`react-native-web Pressable` не реагирует на синтетический `.click()`** через preview-tools. Для DOM-эмуляции пользовательского тапа в preview_eval нужна полная последовательность `pointerdown → mousedown → pointerup → mouseup → click`. Real-user тач работает корректно — это только про тестирование через DOM API.
- ❌ **«Phone-иконка для "Без звонков" step».** Step с Phone-иконкой читался противоречиво («мне будут звонить?»). **Правильно:** Lock-иконка для privacy-step или вообще переформулировать step в benefit-фрейм (что **получит** клиент, не **не получит**).

### Что НЕ сделано (зафиксировано как follow-up в TASKS.md)

- **Миграция БД `locations` таблицы** — заменит hardcoded `villagesByDistrict` const на запросы из БД. Структура `locations(id, name, type='city'|'village', parent_district)`. Позволит admin'у добавлять сёла без code-deploy. Это **расширение** scope (новая фича admin tooling), не сокращение текущего.
- **LocationPicker в master profile** — расширить мастера от city до района/села. Сейчас `master_profiles.city_id`, нужны `master_profiles.district` + `master_profiles.village`.
- **Multi-select для master service zone** — мастер указывает «работаю в N городах/сёлах». UI-mode `multi=true` в LocationPicker + БД-таблица `master_service_zones(master_id, location_id)`. Аналог Ingush-Business `LocationFilterSheet`.
- **LoginWall guard на handleSubmit `orders/new`** — анон должен залогиниться перед публикацией. `useLoginWall(reason)` hook уже есть. Подключить guard.
- **Safety-баннер на форме** — Яндекс-pattern. «Мы не сторона сделки, не уходите в сторонние мессенджеры».
- **Upload фото к заказу** — image-picker уже стоит, нужен UI слот для 5 фото.

### Верификация

- `npx tsc --noEmit` → 2 pre-existing route-typing ошибки (`(tabs)/category/[id].tsx:93`, `(tabs)/master/[id].tsx:98`), **не от моих правок**.
- Preview happy-path: тап на trigger «Выберите локацию» открыл sheet → клик Магас + Назрановский район + Экажево → клик «Готово» → sheet закрылся → trigger показал «Магас · Экажево». DOM подтверждено через `preview_eval`.
- LocationPicker dark mode: фоновая card инвертируется (canvas-soft на чёрном) + Lock-кружок инвертируется (белый с чёрным замком) — корректная Vercel-инверсия.
- Lazyweb-поиск: 3 запроса по «post task request form / create job request form / trust safety badge phone hidden marketplace». Лучший хит — Duckbill cleaning request form (similarity 0.52).

### Файлы

**Новые:**
- `src/features/orders/LocationPicker.tsx` (~270 строк)
- `docs/location-system.md` (полный design-doc)

**Изменённые:**
- `app/(tabs)/orders/new.tsx` (hero rewrite + единый submit + StepItem)
- `src/features/orders/OrderFormBody.tsx` (Vercel labels + chips + LocationPicker интеграция)
- `src/features/orders/order-schema.ts` (ALL_INGUSHETIA_CITY + districtOptions + villagesByDistrict + helpers)
- `src/features/orders/use-create-order.ts` (`"all"` → `null` конвертер)
- `app/(tabs)/orders/edit/[id].tsx` (`null` → `"all"` reset)
- `app/(tabs)/orders/index.tsx` (nullable city_id в NewOrdersTabProps + graceful fallback в 3 OrderRow)
- `src/types/database.ts` (orders.city_id: string | null + регенерация шапки)
- `CLAUDE.md` (2 новых критических правила)
- `STATUS.md` (новая секция «вечер 2026-05-14»)
- `TASKS.md` (orders new closed + 3 follow-up tasks)

---

## Поздняя ночь 2026-05-14 — Location system rewrite по образцу Ingush-Business

### TL;DR

Полная архитектурная переработка системы локации в xtrud по образцу проекта Ingush-Business (его отчёт прислал пользователь с задачей «делай как тут, не сокращай»). Единый source-of-truth `location-config.ts`, расширение до 8 поселений РИ через миграцию БД, `useUserCity` hook с init-циклом geolocation, 2 новых UI компонента `<LocationSheet>` / `<LocationFilterSheet>` под разные UX-задачи.

### Закрытые задачи

1. **`src/lib/location-config.ts`** — новый единый источник истины. Структура повторяет Ingush-Business `lib/config.ts`:
   - `MAJOR_CITIES` — 8 поселений РИ (5 cities из БД + 3 крупных села-городка).
   - `DEFAULT_CITY_ID = "nazran"` — fallback.
   - `ALL_INGUSHETIA_CITY_ID = "all"` — спец-id для «Вся Ингушетия» (на submit → NULL).
   - `CITY_COORDINATES` — координаты (lat/lng) для Haversine.
   - `DISTRICTS` — массив `{id, name, villages}` для 4 муниципальных районов с вложенными сёлами (32 села).
   - `villagesByDistrict` — Record `district name → villages` (для совместимости).
   - `districtNames` — array имён районов.
   - `FILTER_VILLAGES` — плоский отсортированный список всех 32 сёл (для Set-фильтра).
   - `getNearestCity(lat, lng, thresholdKm=30)` — Haversine distance, fallback на DEFAULT_CITY_ID.
   - `findDistrictByVillage(name)` / `isDistrictName(name)` / `isVillageName(name)` — helpers.
   - `getCityName(id)` — id → имя с fallback.
   - `LocationFilter` type `{isAll, cities[], districts[]}` + `EMPTY_LOCATION_FILTER`.
   - `getLocationLabel(filter)` — короткая строка для trigger pill.
   - `LocSet` type `ReadonlySet<"c:cityId" | "v:village">` + helpers `locSetAddCity` / `locSetAddVillage` / `locSetToFilter`.

2. **Миграция `0050_cities_add_large_villages.sql`** — `INSERT ON CONFLICT DO NOTHING` для 3 поселений в supabase.cities: Орджоникидзевская / Серноводская / Нестеровская. Эти 3 раньше жили как villages Сунженского района, после миграции — top-level cities (по образцу Ingush-Business где они были в `CITIES`). Применена на прод через MCP `apply_migration`.

3. **`src/lib/use-user-city.ts`** — новый hook взамен старого плоского `useCityStore`:
   - Zustand store + persist (`xtrud-city` ключ, version bumped 2 → 3 из-за новых полей `isInitialized`, `isUserChoice`).
   - `partialize` сохраняет только `cityId` + `isUserChoice`, `isInitialized` всегда false при cold start.
   - При mount, если `isUserChoice === false`, запускается init-цикл: `getDeviceCoordinates()` → если ok → `getNearestCity(lat, lng)` → `markInitialized(cityId, isUserChoice=false)`. Если geo не сработал → fallback `DEFAULT_CITY_ID`.
   - `getDeviceCoordinates()` — web через `navigator.geolocation.getCurrentPosition()` с 5s timeout. Native — заглушка с inline TODO про `expo-location` (пакет не установлен, пока fallback на default).
   - Hook `useUserCity()` возвращает `{cityId, cityName, setCity, isInitialized, isUserChoice}`.
   - Legacy exports: `getCityName`, `useCityStore`, `getCurrentCityIdSync`, `setAllIngushetia`.

4. **`<LocationSheet>` компонент** (`src/components/ui/LocationSheet.tsx`, ~190 строк) — multi-select городов и районов в bottom-sheet'е:
   - Toggle «Вся Ингушетия» card вверху (снимает остальные).
   - Раздел «Города» — 8 chips (multi).
   - Раздел «Районы» — 4 chips (multi).
   - Reset link «Сбросить фильтр» (не показывается когда isAll).
   - Sticky bottom CTA «Применить» — commit `LocationFilter` через `onApply`.
   - Draft-state локально (commit-on-«Применить»).

5. **`<LocationFilterSheet>` компонент** (`src/components/ui/LocationFilterSheet.tsx`, ~230 строк) — multi-select городов и сёл напрямую через Set:
   - State — `Set<"c:cityId"|"v:village">`.
   - Два режима UI: `"cities"` (главный экран с городами + кнопка «Выбрать сёла») и `"villages"` (open-state с search-input + chip-grid 32 сёл, фильтр через `.includes`).
   - Сводка выбранного (счётчики городов/сёл) + reset link в режиме "cities".
   - Sticky bottom — Apply / Back (в villages-режиме).

6. **`src/components/CitySelector.tsx` переписан** под `useUserCity` + `MAJOR_CITIES` из location-config. Удалён local Zustand store (унаследовался для legacy через re-export `useCityStore` из use-user-city). Список cities в PickerSheet теперь содержит все 8 поселений + «Ингушетия» (для «Вся Ингушетия»).

7. **`src/features/orders/order-schema.ts` упрощён** — все локационные константы (`ALL_INGUSHETIA_CITY`, `districtOptions`, `villagesByDistrict`, `findDistrictByVillage`, `isDistrict`) переехали в `location-config.ts`. В schema-файле оставлены только re-export'ы для обратной совместимости импортов из `OrderFormBody` / `LocationPicker` / `orders/edit`.

8. **`src/components/ui/index.ts`** — экспорт двух новых компонентов: `LocationSheet`, `LocationFilterSheet`.

9. **`app/(tabs)/orders/index.tsx`** — обновлён после автоматического merge другого агента: `cityName={o.city?.name ?? o.city_id ?? "Вся Ингушетия"}` в 4 OrderRow + `city_id: string | null` в `NewOrdersTabProps`.

10. **Документация:**
    - **`docs/location-system.md`** — обновлён до полной архитектуры: TL;DR расширен, секция «Компоненты — обзор» с описанием 4 компонентов, расширенный список follow-up tasks (5 пунктов вместо 3), новая запись в «История ключевых решений».
    - **`STATUS.md`** — новая секция «Текущее состояние (поздняя ночь 2026-05-14, location-архитектура)» с описанием всех изменений + списком файлов + верификацией.
    - **`TASKS.md`** — закрыты 8 пунктов в новом разделе «✅ Сделано Sprint J — поздний вечер 2026-05-14 (location-архитектура)», расширены open-tasks до 5 follow-up задач (БД locations / native geolocation / LocationFilterSheet в master profile / LocationSheet в master feed / LocationPicker в master profile single-mode).
    - **`SESSION_SUMMARY_2026-05-14.md`** — добавлена эта секция (не плодя новых файлов).

### Новые компоненты / паттерны

- **`<LocationSheet>` (`src/components/ui/LocationSheet.tsx`)** — multi-select городов и районов. **Когда использовать:** master service zone (где мастер работает), master feed фильтр, поиск с несколькими локациями. **Когда НЕ использовать:** один заказ → `<LocationPicker>` (иерархия с сёлами).
- **`<LocationFilterSheet>` (`src/components/ui/LocationFilterSheet.tsx`)** — multi-select городов и сёл напрямую через Set. **Когда использовать:** нужны конкретные сёла без района целиком, типизированный Set-API для БД-хранения. **Когда НЕ использовать:** иерархический выбор для одного заказа.
- **Pattern «единый source-of-truth `lib/location-config.ts`»** — все константы локации в одном файле. Никаких дубликатов в компонентах. Re-export'ы только для обратной совместимости импортов, чтобы не ломать consumers'ов одним коммитом.
- **Pattern «3 уровня location-компонентов»** — `<CitySelector>` (один город / `useUserCity`), `<LocationPicker>` (иерархический single для заказа), `<LocationSheet>` / `<LocationFilterSheet>` (multi-select разных типов). Каждый под свой UX-сценарий. Принцип Ingush-Business.

### Anti-patterns обнаруженные

- ❌ **«Дублирование констант локации в компонентах»** — в Ingush-Business `LocationSheet.tsx` была своя локальная CITIES/DISTRICTS (отмечено в их же отчёте как `⚠️ рассинхронизация возможна`). У нас единый источник `location-config.ts`, все импортируют отсюда.
- ❌ **«Регенерация без проверки старых типов»** — после миграции 0049 я делал точечные правки в `database.ts` для `orders.city_id`. Другой агент позже регенерировал весь файл через MCP — корректное решение. Правило: для серьёзных миграций сразу использовать MCP `generate_typescript_types`, не точечные правки.
- ❌ **«Не trackать перезаписи параллельных агентов»** — `orders/index.tsx` был частично переписан другим агентом, мои nullable-fallback'ы откатились. Правило: при возврате после параллельной работы — обязательно `npx tsc --noEmit` сразу + git status, чтобы поймать регрессии.

### Что НЕ сделано (зафиксировано как follow-up)

- **БД-таблица `locations`** — для замены hardcoded const на admin-driven. Структура `locations(id, name, type, parent_id, lat, lng, sort_order)`. Это **расширение** scope в новую feature-зону (admin tooling), не сокращение. См. TASKS.md.
- **Native geolocation через expo-location** — пакет не установлен, пока fallback на DEFAULT_CITY_ID на native. Inline TODO в `use-user-city.ts:getDeviceCoordinates`.
- **Интеграция LocationFilterSheet в master profile edit** — для master service zone. Компонент готов; нужна БД-таблица + UI-обёртка.
- **Интеграция LocationSheet в master feed фильтр** — компонент готов; нужно подключить к use-master-feed.
- **LocationPicker single-mode в master profile (district + village)** — расширение мастер-онбординга.

### Верификация

- `npx tsc --noEmit` → чисто.
- Preview (dark mode): открыт LocationPicker bottom-sheet в `/orders/new`. DOM содержит 8 cities (Магас / Назрань / Сунжа / Малгобек / Карабулак / **Орджоникидзевская / Серноводская / Нестеровская**), 4 районов, sticky CTA «Готово».
- Прод-БД: `SELECT id, name FROM cities ORDER BY sort_order` возвращает 8 записей (5 старых + 3 новых).

### Файлы

**Новые:**
- `src/lib/location-config.ts` (~290 строк — единый source-of-truth)
- `src/lib/use-user-city.ts` (~170 строк — hook с init-циклом)
- `src/components/ui/LocationSheet.tsx` (~190 строк — multi-select)
- `src/components/ui/LocationFilterSheet.tsx` (~230 строк — Set-API)
- `supabase/migrations/0050_cities_add_large_villages.sql`

**Изменённые:**
- `src/components/CitySelector.tsx` — переведён на useUserCity + MAJOR_CITIES
- `src/components/ui/index.ts` — export LocationSheet / LocationFilterSheet
- `src/features/orders/order-schema.ts` — re-export'ы из location-config (упрощён до Zod-only)
- `app/(tabs)/orders/index.tsx` — graceful fallback null city_id + nullable в NewOrdersTabProps
- `docs/location-system.md` — обновлён до полной архитектуры
- `STATUS.md`, `TASKS.md`, `SESSION_SUMMARY_2026-05-14.md` — документация
