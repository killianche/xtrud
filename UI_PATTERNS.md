# UI_PATTERNS.md — Кук-бук экранов и компонентов xtrud

> ⚠️ **Чат удалён (classifieds-модель).** Не использовать `/chats`, таб «Чаты»
> или CTA «написать в чат»: контакт — звонок/WhatsApp. См.
> [`docs/SIMPLE_FLOW.md`](docs/SIMPLE_FLOW.md). Паттерны вёрстки
> (header / list / chip / hero / empty-state) актуальны.

> **Для AI-агента:** перед проектированием ИЛИ существенным редизайном **любого** экрана сначала прочитай этот файл. Здесь зафиксированы все стандартные архетипы страниц, building blocks и anti-patterns. Если нужно отойти от стандарта — обоснуй в отчёте.
>
> **Для человека:** это «вот как у нас всё устроено» — единый источник истины по UI-паттернам. Если делаешь новую фичу или ревьюишь PR — сравнивай с этим документом.
>
> **Связано:**
> - [`DESIGN.md`](DESIGN.md) — токены (цвета, типографика, радиусы, spacing). Этот файл — **паттерны поверх токенов**, без дублирования.
> - [`MASTER_REDESIGN_SPEC.md`](MASTER_REDESIGN_SPEC.md) — план миграции старых экранов на эти паттерны.
> - [`CROSS_PLATFORM_RULES.md`](CROSS_PLATFORM_RULES.md) — кросс-платформенные правила (Expo + RN + Web).
> - [`.claude/rules/design-quality.md`](.claude/rules/design-quality.md) — чек-лист закрытия UI-задачи.
> - [`CATEGORIES_AND_PROFILES.md`](CATEGORIES_AND_PROFILES.md) — таксономия + product scope.
> - [`docs/UNIVERSAL_TASK_BOARD.md`](docs/UNIVERSAL_TASK_BOARD.md) — CURRENT/TARGET и полный flow универсального задания.

---

## TL;DR — алгоритм проектирования нового экрана

1. **Какой тип экрана?** Сверь с разделом «Архетипы страниц» (5 штук). Не изобретай новый — почти наверняка попадаешь в один из них.
2. **Какие блоки нужны?** Сверь с разделом «Building blocks» (header / list-row / chip / hero / skeleton / empty / sticky-CTA). Используй готовые компоненты.
3. **Что НЕ делать?** Прогляди раздел «Anti-patterns» — самые частые ошибки.
4. **Как назвать?** В разделе «Naming» для каждого паттерна указано имя/файл — используй те же.
5. **Перед коммитом:** прогони чек-лист в `.claude/rules/design-quality.md`.

---

## 0. ОСНОВА ДИЗАЙНА — edge-to-edge rows + узкий side-padding

**Зафиксировано 2026-05-15** (фидбэк user после редизайна master home — «отступы не такие большие, материал карточки, линии до краёв, давай это основа дизайна»).

> **Переопределено для лент заданий 2026-09-02** (DECISION владельца по
> сборке 20 на устройстве, образец — Thumbtack): задание — **карточка**
> с рамкой и радиусом, между карточками 12, от краёв 16; текст в карточке
> не мельче 14, заголовок и цена 18. Полный стандарт — `DESIGN.md`, раздел
> «Решение владельца 2026-09-02 (вечер)». Для списков категорий и настроек
> full-bleed строки ниже остаются в силе.

**Главный принцип:** списки заявок / мастеров / категорий / откликов — **full-bleed rows** с `border-b border-hairline` divider'ом, идущим **от края до края экрана**. **Никаких** «карточек с большими side-margin'ами и rounded-lg bg-canvas-soft» вокруг каждого row — это утяжеляет визуал и сбивает hierarchy.

**Стандартные значения:**
- **Wrapping container** на tab home / list view: `px-4` (НЕ `px-5`). 16px горизонтально — достаточно «дыхания», но без визуального вырезания контента.
- **Row internal padding:** `px-5 py-4` (внутри `<OrderRow>` и аналогичных row). Внутри row своё дыхание; row сам по себе full-bleed относительно экрана.
- **Когда row рендерится внутри padded-секции:** оборачиваем в `-mx-4` чтобы вырваться в края: `<View className="-mx-4">{rows}</View>`. Это компенсирует родительский `px-4`.
- **Section gap:** между секциями (статус → orders → completed-pill) — `gap-8` (32px). Раньше было gap-6 — узковато.
- **Section heading:** `text-body-md semibold ink` (не uppercase eyebrow). Опц. mono-caption справа («до завтра», «3 заявки»).

**Когда отступать от паттерна (исключения):**
- **Hero / featured-карусель** — горизонтальный scroll с tinted plate-карточками (FeaturedRequests, TopMasters). Это акцентные блоки, тут карточка уместна.
- **Single CTA-баннер** («Не нашли мастера?», «Добавьте категории») — одиночная карточка с border + bg-canvas-soft в `mx-4`. Не список, поэтому полу-карточка ОК.
- **Detail-страница заказа `/orders/[id]`** — там специфический layout с большой description-секцией и формой отклика. Не трогать (фидбэк user 2026-05-15: «после заказов хорошо выглядит»).

**Эталонные реализации (копировать):**
- `app/(tabs)/orders/search/index.tsx` — list view с `<OrderRow>` full-bleed.
- `src/features/master-view/MasterDashboardOrders.tsx` — orders на главной мастера, использует `-mx-4` чтобы вырваться из родительского `px-4`.
- `src/features/master-view/MasterHomeContent.tsx` — обёртка `<View className="gap-8 px-4">`.
- `app/(tabs)/index.tsx` → `AllCategories` — список категорий с `border-b border-hairline` rows.

**Anti-patterns (запрещено):**
- ❌ `<View className="rounded-lg bg-canvas-soft p-4">` вокруг каждого OrderRow на главной — утяжеляет, ломает edge-to-edge.
- ❌ `gap-3` или `mt-3` между крупными секциями — слишком тесно. Минимум `gap-6`, лучше `gap-8`.
- ❌ `px-5` или больше на tab home — слишком много пустого с боков. Используй `px-4`.
- ❌ Order rows внутри ScrollView без `-mx-4` — будут вырезанные с боков, не full-bleed.

---

## 1. Эталонные экраны (golden references)

Если сомневаешься «как сделать» — посмотри **код этих экранов**. Они приняты как стандарт.

| Экран | Файл | Что эталонно |
|---|---|---|
| `/orders/search` (master) | `app/(tabs)/orders/search/index.tsx` | Tab-screen header, list-style OrderRow, accent-pill rightAction, scope-фильтр L1 |
| `/orders/search/filters` | `app/(tabs)/orders/search/filters.tsx` | Filter screen с back+sticky-CTA «Применить · N», SortChip, button-trigger «Выберите категории» |
| `/orders/search/category-select` | `app/(tabs)/orders/search/category-select.tsx` | Multi-select picker, search-input, accent checkbox-индикатор, sticky CTA |
| `/orders` (master) | `app/(tabs)/orders/index.tsx` (`MasterOrdersView`) | Tab-screen с TabPills, скрытый «Новые» (= /orders/search), responded/assigned секции |
| `/profile` (master) | `app/(tabs)/profile/index.tsx` | Tab-screen без back, опц. rightAction Pencil, навигационные карточки секций, ghost-link «Посмотреть глазами клиента», compact theme-segmented |
| `/master/[id]` | `app/(tabs)/master/[id].tsx` | Detail-screen ScreenHeader с back, hero-photo карусель 4:5, sticky bottom CTA |
| `ServiceAreasSection` | `src/features/master-profile/ServiceAreasSection.tsx` | Toggle-карточка «Вся Ингушетия» сверху + accent chips город/район ниже |
| `/index` (Home client) | `app/(tabs)/index.tsx` | Hero-illustrations с tinted-bg + декоративные фигуры, animated fade-in, color-icons, mt-10 section gap |

**Если делаешь новый screen — открой ОДИН из этих, скопируй структуру, поменяй контент.** Не изобретай.

---

## 2. Архетипы страниц (5 типов)

### 2.1. Tab home / dashboard

Главная страница таба, которая открывается при тапе на иконку в нижнем меню. **Например:** `/index` (Home), `/profile` (Профиль), `/notifications` (когда будет таб).

**Структура (сверху вниз):**

```
[ScreenHeader title + опц. rightAction]   ← height 64
[Hero/Welcome block]                       ← опц., полноэкранный визуальный анкер
[Section 1: title-lg + content]            ← mt-6
[Section 2]                                ← mt-10 (БОЛЬШОЙ gap между секциями)
[Section N]                                ← mt-10
[HelpCallout / FooterCTA]                  ← опц., внизу
```

**Правила:**
- НЕТ back-кнопки (это таб!).
- TabBar visible (НЕ вызывать `setTabBarHidden(true)`).
- Между крупными секциями — `mt-10`.
- Внутри секции — `mt-3..mt-4` от заголовка к контенту.
- Heading: `<AppText weight="semibold" className="text-title-lg text-ink">`.
- Опционально подзаголовок: `<AppText className="mt-1 text-body-sm text-mute">`.
- Async-данные: `Animated.timing` opacity 280ms fade-in (см. эталон `TopMasters` в `app/(tabs)/index.tsx`).
- Skeleton — повторяет форму реальной карточки (НЕ ActivityIndicator).
- Pull-to-refresh: `usePullToRefresh()` хук + `refreshControl={refresh.control}`.

### 2.2. Tab list

Таб-страница со списком (заказы, отклики, кейсы). **Например:** `/orders`.

**Структура:**

```
[ScreenHeader title + опц. subtitle]       ← height 64 (88 с subtitle)
[Опц. TabPills (compact segmented)]        ← px-6 mt-4
[List of OrderRow / row-component]         ← FULL-BLEED, без gap между, с border-b разделителями
[Опц. «Показать ещё» ИЛИ infinite scroll]
[Опц. EmptyState с иллюстрацией если 0]
```

**Правила:**
- Список — **полностью без обводки**, разделитель — `border-b border-hairline` снизу каждой строки. **Никаких rounded-card в feed-списках.**
- Каждая row — стандартный компонент с **встроенным padding** (`px-5 py-4`). **Parent НЕ даёт `px-X` или `gap-Y`** — иначе нарушится full-bleed.
- TabPills (если есть): `<View className="flex-row gap-1 self-start rounded-pill bg-surface-2 p-1">` с `<TabPill label count selected onPress />` внутри. Active = `bg-canvas text-ink semibold`, inactive = `text-muted`. Эталон — `app/(tabs)/orders/index.tsx` функция `TabPill`.
- Empty state — НЕ просто текст, а блок с иконкой + заголовок + объясняющий текст + опц. CTA. См. раздел «Empty state recipe».

### 2.3. Detail page (sub-page открытая из tab)

Открывается через push, имеет back. **Например:** `/master/[id]`, `/orders/[id]`, `/category/[id]`.

**Структура:**

```
[ScreenHeader title onBack rightAction]    ← height 64, ChevronLeft
[Hero block — фото / иллюстрация / большой meta-блок]
[Body sections с mt-6]
[Sticky bottom CTA — опц., главное действие экрана]
```

**Правила:**
- ВСЕГДА передавать `onBack` (это detail!).
- TabBar — для большинства detail-страниц **скрыт** через `useTabBarVisibility().setHidden(true)` в `useFocusEffect`. Исключение: middle pseudo-tab типа `/orders/search` остаётся видимым (пользователь воспринимает как tab).
- Sticky bottom CTA — для primary action (откликнуться, открыть контакт, опубликовать). Pill-кнопка `bg-primary` (всё ещё `ink` для CTA), полноширинный `<Button variant="primary" size="lg" fullWidth />`.
- Hero — обычно фото 4:5 / 16:9 + meta-row под ним.

### 2.4. Filter / picker screen

Полноэкранная страница для выбора фильтров или multi-select picker. **Например:** `/orders/search/filters`, `/orders/search/category-select`, `/orders/category-select` (создание заказа).

**Структура:**

```
[ScreenHeader title onBack rightAction="Сбросить" (опц)]  ← height 64
[Опц. Search input если список длинный]                   ← mx-5 mt-4
[ScrollView с options:]
  - Section 1: «Сортировка» (chip-row)
  - Section 2: «Раздел» (L1 chips)
  - Section 3: «Категории» (L2 chips)
[Sticky bottom: <Button variant="primary" size="lg" fullWidth>Применить · N</Button>]
```

**Правила:**
- **Полноэкранный экран, НЕ inline expandable панель.** Раньше /orders/search имел expandable filter block — это запрещено (фидбек user 2026-05-15 «фильтры должны открываться на отдельном экране большие и удобные»).
- TabBar **скрыт** через `useTabBarVisibility`.
- Состояние фильтров — в **Zustand store** (живёт между экранами `/filters → /category-select → back`). Эталон — `src/features/orders/orders-search-filters-store.ts`.
- Каждая категория-pill: `border-accent bg-accent-soft text-accent` selected, `border-hairline bg-canvas text-ink` default.
- Sticky footer: `<View className="border-t border-hairline pt-3" style={{paddingBottom: insets.bottom + 12}}>` + полноширинный `<Button>Применить · N</Button>`.
- RightAction header: «Сбросить» (`Trash2` icon) когда есть активные фильтры.

### 2.5. Edit form / wizard

Форма редактирования или создания. **Например:** `/profile/edit-master`, `/profile/edit-client`, `/orders/new`, `/orders/edit/[id]`, `(onboarding)/master-profile`.

**Структура:**

```
[ScreenHeader title onBack]                  ← с back; для wizard — без back на 1-м шаге
[KeyboardAvoidingView + ScrollView:]
  [Heading: text-display-sm (опц. на странице верхушки)]
  [Form sections с heading + поля]
    - Section: «Об авторе» (имя, аватар)
    - Section: «Контакты»
    - Section: «О себе» (textarea с char-counter)
[Submit error text если есть]
[Sticky bottom: <Button variant="primary" fullWidth>Сохранить</Button>]
```

**Правила:**
- `KeyboardAvoidingView` с `behavior="padding"` на iOS, `undefined` на web.
- Поля группируются в секции с заголовком (text-body-sm-strong) — НЕ flat-список из 20 полей.
- Counter символов для textarea: `<AppText className="text-caption text-mute">12 / 500</AppText>`.
- Confirm на back если форма dirty: `confirmAsync` (`src/lib/confirm.ts`) — кросс-платформенный.
- Auto-save где возможно (см. эталон `ServiceAreasSection` — каждый chip-toggle мгновенно persist'ит, без save-кнопки).
- Submit-кнопка — `<Button variant="primary" size="lg" fullWidth disabled={!isValid || !isDirty || isBusy}>{isBusy ? "Сохраняем..." : "Сохранить"}</Button>`.

### 2.6. Универсальное задание: форма, category picker и auth-return

**Когда применять:** TARGET универсальной доски из
[`docs/UNIVERSAL_TASK_BOARD.md`](docs/UNIVERSAL_TASK_BOARD.md). Пока feature
выключен, текущий экран сохраняет scope двух L1.

- Создание — один scrollable edit-form screen, не многошаговый wizard. Секции:
  задача → категория → фото → формат/место → срок → бюджет → имя.
- Category picker для 10 L1 — отдельный полноэкранный search-first экран:
  результаты L2/L3/terms группируются под L1, выбранное показывается
  breadcrumb. Горизонтальная chip-row не масштабируется на universal scope.
- «Не знаю категорию» — отдельное текстовое действие, а не видимая категория
  «Прочее». No-results сохраняет запрос и предлагает этот путь.
- `remote` скрывает и очищает обязательность локации; `onsite` требует
  город/район. Переключение не должно оставлять невидимую validation error.
- Guest submit ведёт в обычный login/register, затем возвращает в сохранённый
  draft. Auto-publish запрещён: пользователь повторно нажимает «Опубликовать».
- Фото переживают auth-return либо UI до перехода явно предупреждает о
  необходимости reattach и показывает это состояние после возврата.
- Обязательны initial/search/no-results/loading/error/offline/disabled states,
  обе темы и keyboard/accessibility checks web+iOS.

---

## 3. Building blocks (атомы и молекулы)

### 3.1. ScreenHeader — единственный заголовок экрана

**Файл:** [`src/components/ui/ScreenHeader.tsx`](src/components/ui/ScreenHeader.tsx).

**API:**

```tsx
<ScreenHeader
  title="Поиск заказов"
  subtitle="Опц. — text-body-sm text-muted"  // height 64 → 88 с subtitle
  onBack={goBack}                            // опц., если detail-screen
  rightAction={{                             // опц., pill h-11 справа
    label: "Фильтры",
    Icon: SlidersHorizontal,                 // опц., 16px stroke 2
    onPress: () => router.push('/filters'),
    active: hasActiveFilters,                // true → border-accent bg-accent-soft
    accessibilityLabel: "...",               // опц.
  }}
/>
```

**Размеры (зафиксированы):**
- height: 64px (88 с subtitle)
- title: `text-display-md` (24px) tracking-tight bold
- back: 48×48 touch-target, ChevronLeft 28px stroke 2.25
- rightAction: h-11 px-4 rounded-pill border + опц. icon 16px

**Когда без onBack:** на tab-screens (`/orders`, `/profile`, `/orders/search`).
**Когда с onBack:** на detail-screens (`/master/[id]`, `/orders/[id]`, `/profile/edit-master`).

### 3.2. TabBar — нижняя панель навигации

**Файл:** [`src/components/TabBar.tsx`](src/components/TabBar.tsx).

**Состав слотов зависит от роли:**

- **Клиент:** `[Главная] [Заказы] [Закладки] [Профиль]` — 4 icon-only слота.
- **Мастер:** `[Главная] [Поиск заказов] [Ваши работы] [Профиль]` — 4 icon-only слота.

Middle slot — **псевдо-таб** (Pressable, НЕ настоящий Tabs.Screen):
- Для **клиента** — «Закладки» → `/favorites`.
- Для **мастера** — «Поиск заказов» → `/orders/search`.

Подсветка middle (для master): `pathname.startsWith('/orders/search')` → `text-ink stroke 2.25`. Иначе `text-mute stroke 1.75`.

**Взаимоисключение:** когда `isSearchActive` для мастера, таб «Заказы» **тоже становится not-focused** (две подсветки одновременно — баг). См. логику в `TabBar.tsx` функция `renderTab`. (Актуально для клиента, у которого «Заказы» отображается; для мастера таб уже скрыт.)

**Скрыть TabBar:** `useTabBarVisibility().setHidden(true)` в `useFocusEffect` — для full-screen форм / wizards / pickers.

### 3.3. OrderRow / список-row

**Файл:** [`src/components/OrderRow.tsx`](src/components/OrderRow.tsx) (эталон).

**Canonical reference** — экран `/orders/search` ([`app/(tabs)/orders/search/index.tsx`](app/(tabs)/orders/search/index.tsx)). Зафиксирован 2026-05-15 как gold-standard для всех плоских inbox-листов в продукте: hairline-разделители без скруглений, inline-иконка 16px перед title, mono time справа, category-eyebrow, 2-line description, mono budget строкой, meta-row (urgency · location · опц. responses). Любой новый list-экран копирует именно эту визуальную структуру.

**Стиль list-row (full-bleed):**

```tsx
<Pressable className="flex-row items-start gap-3 border-b border-hairline bg-canvas px-5 py-4 active:bg-canvas-soft">
  <View className="h-9 w-9 items-center justify-center rounded-lg bg-canvas-soft-2">
    <Image source={colorIconUrl} style={{ width: 20, height: 20 }} />  {/* или Lucide 18px */}
  </View>
  <View className="flex-1 min-w-0">
    {/* Row 1: title + time-mono right */}
    <View className="flex-row items-start gap-2">
      <AppText weight="semibold" className="flex-1 text-body-md text-ink" numberOfLines={2}>{title}</AppText>
      <AppText weight="mono" className="text-mono-caption text-muted-soft">9 ч</AppText>
    </View>
    {/* Row 2: category eyebrow */}
    <AppText className="mt-1 text-caption text-mute">{categoryName}</AppText>
    {/* Row 3: status-dot + meta */}
    <View className="mt-2 flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <View className="h-2 w-2 rounded-full bg-accent" /> <AppText className="text-caption text-accent semibold">Открыта</AppText>
      <AppText className="text-caption text-muted-soft">·</AppText>
      <AppText className="text-caption text-mute">{urgency}</AppText>
      ...
    </View>
  </View>
</Pressable>
```

**Жёсткие правила:**
- НЕТ `border + rounded` вокруг строки. Plain inbox-style.
- `border-b border-hairline` снизу — разделитель между строками.
- Иконка 32px (h-9 w-9) с SVG 18-20px. **НЕ 44px** (это раньше было — сейчас слишком крупно).
- Padding встроенный (`px-5 py-4`). **Parent даёт `<View>{rows}</View>` БЕЗ gap, БЕЗ px.**
- Time справа в первой строке — `text-mono-caption text-muted-soft`.
- Status-dot 8×8 + цветной короткий лейбл (НЕ тяжёлый pill).

**Видимость поля «N откликов»:**
- Default — **показывается**. Клиент-владелец заказа должен знать сколько откликов.
- Для **мастера** — **скрывать** через `showResponsesCount={false}`. Чужие отклики на чужой заказ — конкурентная инфа, мастеру не нужна (фидбэк user 2026-05-15: «мастер не должен видеть сколько откликов у заказа»). Применяется в:
  - `/orders/search` — лента всех open-заказов
  - `/orders` master list «Я откликнулся»
  - `MasterDashboardOrders` — дашборд на главной мастера

**Видимость status-точки и лейбла:**
- Default — **показывается** для пользовательских classifieds-состояний (`open`, `cancelled`, `expired`). Используется в `/orders` (Мои заказы клиента / архив), в master-list «Я откликнулся» и в `MasterDashboardOrders`.
- На `/orders/search` — **скрыта** (`status` prop не передаётся). Феед фильтруется по `.eq("status","open")` на запросе, поэтому показывать «● Открыта» на каждой карточке — шумный noise: пользователь и так знает, что в поиске только открытые заявки. Закрытые / in_progress сюда никогда не попадают (фидбэк user 2026-05-15). Это часть canonical-дизайна `/orders/search`: meta-row начинается сразу с urgency.

Если делаешь новый row-компонент — копируй эту структуру.

### 3.4. Selected chip / pill — accent, не ink

**Запрещено:** `border-ink bg-ink text-on-primary` (чёрный pill). User 2026-05-15: «черные кнопки не делай».

**Стандарт selected pill:**

```tsx
className={`h-10 items-center justify-center rounded-pill border px-4 ${
  selected
    ? "border-accent bg-accent-soft"
    : "border-hairline bg-canvas active:opacity-70"
}`}
// Внутри:
<AppText weight="medium" className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}>{label}</AppText>
```

**Цвета (из DESIGN.md):**
- accent: `#0070f3` (Vercel blue)
- accent-soft: `#d3e5ff` (light tint)

**Когда применять:** все toggleable chip-фильтры, sort-chips, urgency/budget chips в формах, location chips, category chips, urgency chips, etc.

**Исключение — solid accent (не soft):** мелкие checkbox-индикаторы (h-7 w-7 круглые с галочкой) → `border-accent bg-accent` + Check 16px white. Эталон — `app/(tabs)/orders/search/category-select.tsx` стр. 247.

**Big primary CTA** (Применить, Сохранить, Опубликовать — большие sticky-кнопки на весь экран) — пока остаются `bg-primary` (черный). Решение по их стилю — отдельный design-decision.

### 3.5. Hero-иллюстрация (tinted bg + декоративные фигуры)

**Где эталон:** `app/(tabs)/index.tsx` функции `FeaturedRequests` (стр. 230-291) и `DescribeTaskCallout` (стр. 299-337).

**Структура:**

```tsx
<View className={`h-28 ${tintBg} items-center justify-center relative overflow-hidden`}>
  {/* 3-4 декоративные фигуры — canvas-цвета с разной opacity */}
  <View className="absolute rounded-full bg-canvas"
        style={{ top: -18, left: -16, width: 64, height: 64, opacity: 0.35 }} />
  <View className="absolute rounded-full bg-canvas"
        style={{ bottom: -14, right: -10, width: 52, height: 52, opacity: 0.45 }} />
  <View className="absolute rounded-md bg-canvas"
        style={{ top: 18, right: 18, width: 18, height: 18, opacity: 0.55,
                 transform: [{ rotate: "12deg" }] }} />
  {/* Центральная иконка в canvas-circle */}
  <View className="h-14 w-14 items-center justify-center rounded-full bg-canvas">
    <Icon size={28} strokeWidth={1.5} color={accentColor} />
  </View>
</View>
```

**Tints (из tailwind config):**
- `bg-badge-sky` — клининг / повседневное / sky
- `bg-badge-violet` — privacy / AI / премиум
- `bg-badge-amber` — срочное / ремонт / warning
- `bg-badge-emerald` — деньги / success / поручительства

**Когда применять:**
- Hero на tab home (welcome, featured items).
- Empty-state блоки.
- Promo / informational callouts.
- НЕ для plain forms или list rows.

### 3.6. HelpCallout — pink-coral gradient + 2-line copy

**Файл:** [`src/components/HelpCallout.tsx`](src/components/HelpCallout.tsx).

```tsx
<HelpCallout
  title="Не нашли нужного мастера?"
  body="Сообщите нам, мы поищем подходящих мастеров по республике, бесплатно"
  onPress={() => onDescribeTask()}
/>
```

Используй для contextual nudge на главной (под списками, в footer'е). Pink-coral gradient — единственное цветное вкрапление, не смешивать с другими callout-стилями.

### 3.7. Skeleton loaders — повторяй форму реальной карточки

**Файл:** [`src/components/Skeleton.tsx`](src/components/Skeleton.tsx) + `src/components/ui/Skeleton.tsx`.

**Запрещено:** `<ActivityIndicator />` посередине пустого экрана при загрузке списка.

**Правильно:** N skeleton-блоков повторяющих структуру real-row.

```tsx
{/* Для list page — N=4 skeleton-row повторяющих OrderRow */}
{isLoading ? (
  <View className="mt-6">
    {Array.from({ length: 4 }).map((_, i) => (
      <View key={i} className="flex-row items-start gap-3 border-b border-hairline px-5 py-4">
        <Skeleton width={36} height={36} className="rounded-lg" />
        <View className="flex-1">
          <Skeleton height={16} width="70%" className="rounded" />
          <Skeleton height={12} width="40%" className="mt-2 rounded" />
          <Skeleton height={12} width="60%" className="mt-2 rounded" />
        </View>
      </View>
    ))}
  </View>
) : ...}
```

**Готовые skeleton-helpers:** `<CardListSkeleton count={4} />`, `<OrderRowsSkeleton />` (если ещё нет — создай).

### 3.8. EmptyState с иллюстрацией

**Запрещено:** просто `<AppText>Ничего не нашли</AppText>` посередине экрана.

**Правильно (минимальный вариант):**

```tsx
<View className="mt-12 items-center px-6">
  <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas-soft-2">
    <Icon size={24} strokeWidth={1.75} color={muteColor} />
  </View>
  <AppText weight="semibold" className="mt-4 text-title-md text-ink text-center">
    Заявок пока нет
  </AppText>
  <AppText className="mt-2 text-center text-body-sm text-muted">
    Здесь появятся новые заявки клиентов по вашим категориям.
  </AppText>
  {ctaAction && (
    <Button onPress={ctaAction} variant="secondary" size="sm" className="mt-4">
      Расширить категории
    </Button>
  )}
</View>
```

**Усиленный вариант (для главных экранов):** заменить серый круг с иконкой на полноценную **hero-иллюстрацию** (раздел 3.5) — sky-tint + 3 декоративные фигуры + центр-иконка в canvas-circle.

### 3.9. Иконки — Phosphor mono ИЛИ Iconify color, NEVER emojis

**Иерархия выбора:**

1. **Категории услуг** (электрика, сантехника, плитка): `getCategoryColorIconUrl(l2_id)` → Iconify `fluent-color` SVG. См. [`docs/ICONS.md`](docs/ICONS.md).
2. **Действия / мета** (back, share, edit, location pin, contact): Phosphor React Native. Новый mono UI не добавляет Lucide; точные веса и mapping — [`docs/UI_ICONS.md`](docs/UI_ICONS.md).
3. **Аватары** (плейсхолдеры): цветной круг с инициалами имени. `src/lib/avatar.ts` пропускает только настоящее загруженное фото; любая DiceBear-ссылка считается legacy и отбрасывается.

**Запрещено в UI как замена иконкам:** эмодзи (💧 ⚡ 🔨 🛠️ 🚪 и т.п.). Можно только в текстовом контенте кнопок/заголовков (например «Ваш номер скрыт 📵»).

### 3.10. AvailabilitySwitcher / RoleSwitcher / другие segmented controls

См. эталон `<ClientThemeSegmented>` в `app/(tabs)/profile/index.tsx`. Это compact 3-button row внутри `bg-surface-2 rounded-pill p-1`. Active button — `bg-canvas semibold ink`.

Для master-режима тема использует ТОТ ЖЕ компонент (раньше был большой 3-row stacked, заменено 2026-05-15).

### 3.11. PickerSheet — single-select из короткого списка

**Когда использовать:** выбор одной опции из конечного списка 4-30 элементов: город, статус, сортировка, тема, язык. **НЕ** для multi-select (там — full-screen `/category-select` экран с ✓-checkbox'ами и sticky «Применить»).

**Эталон визуала:** `<PickerSheet>` в `src/components/ui/PickerSheet.tsx`. Используется в `<CitySelector>` (Город), и должен использоваться для всех аналогичных «выбрать одно из».

**Структура (зафиксирована 2026-05-15 — фидбек user «дизайн классный, сохрани»):**

```
[ Header: round back-44 + bold display-sm title + (опц. reset-pill) ]  ← px-3 py-2
[ hairline divider mx-4 ]
[ (Опц.) search-input — h-10 rounded-full bg-canvas-soft px-3.5 ]      ← только если items >= 8 И список реально длинный
[ ScrollView с options:
    Каждая row — h-auto py-2 px-5 flex-row gap-3:
      - Square 32×32 rounded-md bg-{accent-soft|canvas-soft} с иконкой Lucide 18 stroke 1.75
      - Title text-body-md (semibold + text-accent если selected, иначе medium ink)
      - (Опц.) subtitle text-caption text-mute
      - Check 20px stroke 2.25 accent справа если selected
]
```

**Дизайн-токены (точные значения — не подбирать «на глаз»):**
- Back-кнопка хедера: `h-11 w-11 rounded-full bg-canvas-soft active:opacity-60`
- Title: `text-display-sm tracking-tight bold ink`
- Search wrapper: `h-10 rounded-full bg-canvas-soft px-3.5`, иконка `Search 16 stroke 1.75 mute`
- Selected row: иконка-bg `bg-accent-soft`, текст `text-accent semibold`, Check `accent`
- Default row: иконка-bg `bg-canvas-soft` (или `iconTint` prop), текст `text-ink medium`
- Voздух между options — нет horizontal divider'ов, только `py-2` между ними

**API:**

```tsx
<PickerSheet
  open={open}
  onClose={() => setOpen(false)}
  title="Город"
  options={CITIES.map((c) => ({
    id: c.id,
    title: c.name,
    icon: <MapPin size={18} strokeWidth={1.75} color={tc.ink} />,
  }))}
  selectedId={cityId}
  onSelect={(id) => { setCity(id); setOpen(false); }}
  searchable={false}  // явно выключить если короткий список (<= 8 умещается без скролла)
  resettable          // показать «Сбросить» в хедере если есть selected
/>
```

**Когда search показывать / скрывать:**
- **Скрывать (`searchable={false}`):** ≤ 8 опций, помещаются на экране без скролла, разница названий очевидна (Город Ингушетии — 8 поселений). Поиск избыточен и забирает фокус.
- **Показывать:** 15+ опций ИЛИ длинные похожие названия (улицы, услуги, теги). Auto-default `searchable ?? options.length >= 8`.

**Anti-patterns (запрещено):**
- ❌ Drag-handle полоска на full-screen modal — нечего «свайпать», только запутывает.
- ❌ Чекмарк-символ «✓» в строке текста — выглядит как опечатка. Используй `<Check>` icon справа.
- ❌ Plain list без иконок — нет visual hierarchy, всё сливается.
- ❌ Inline `style={{color: tc.ink}}` для текста — на web может не resolve'иться в dark theme. Используй NativeWind `text-ink` className. Hex color оставляем только для prop'а Lucide-иконок.
- ❌ Bottom-sheet вместо full-screen для пункта с 5+ опциями — занимает 60% экрана и закрывает контекст. Full-screen просторнее, удобнее для тапа.

**Эталонные использования в репо:**
- `src/components/CitySelector.tsx` — выбор города (короткий список, search скрыт)
- Будущие: статус мастера (4 опции), сортировка (3-5 опций), тема (3 опции), и т.д.

---

## 4. Spacing & gap rules

| Где | Размер | Token |
|---|---|---|
| Между крупными секциями экрана | 40px | `mt-10` |
| Внутри секции от заголовка к контенту | 12-16px | `mt-3..mt-4` |
| Между элементами одной группы | 8-12px | `gap-2..gap-3` |
| Header padding horizontal | 12px | `px-3` |
| Body content padding horizontal | 20-24px | `px-5..px-6` |
| List-row внутренний padding | 20×16 | `px-5 py-4` |
| List между rows | 0px (border-b разделитель) | — |
| Между секциями в форме | 24px | `mt-6` |

Эти числа — **не предложение, а конвенция**. Если отходишь — обоснуй в отчёте.

---

## 5. Типографика и шрифты — резюме

Полная шкала — в [`DESIGN.md`](DESIGN.md). Здесь — самые частые применения:

| Назначение | Класс | Размер |
|---|---|---|
| H1 экрана / display | `text-display-md` или `text-display-sm` | 24 / 20 |
| Заголовок секции | `text-title-lg` semibold | 18 |
| Имя в карточке мастера | `text-body-lg` semibold | 18 |
| Title строки в списке | `text-body-md` semibold | 16 |
| Body / описания | `text-body-md` или `text-body-sm` | 16 / 14 |
| Eyebrow / category-метка | `text-caption text-mute` | 12 |
| Цены / рейтинги / время «9 ч» | `text-mono-body` или `text-mono-caption` (`weight="mono"`) | 14 / 12 |
| Subtitle под title | `text-body-sm text-muted` | 14 |
| UPPERCASE section-label (для форм) | `text-caption uppercase tracking-wider text-muted` | 12 |

**Минимум читаемого:** 12px. Меньше — запрещено (`text-caption-xs` = 10px удалён из шкалы).

**Mono-шрифт обязателен** для всех цифр-метрик: рейтинг, цена, расстояние, время, опыт, счётчики.

---

## 6. Anti-patterns — что запрещено

| Запрещено | Почему | Что делать |
|---|---|---|
| `<ActivityIndicator />` посередине пустого экрана при загрузке | Выглядит как сломанный экран; не даёт понять что грузится | Skeleton повторяющий форму карточки (раздел 3.7) |
| Selected chip с `border-ink bg-ink text-on-primary` | Чёрные пиллы доминируют, выглядят тяжело | `border-accent bg-accent-soft text-accent` (раздел 3.4) |
| Эмодзи как иконка (💧 ⚡ и т.п.) | Выглядит «детским placeholder»; разное на платформах | Phosphor или Iconify color (раздел 3.9) |
| `<View className="rounded-xl border border-hairline">` вокруг строки в feed-списке | List должен быть full-bleed; обводка делает feed «карточным», тяжёлым | `border-b border-hairline px-5 py-4` (раздел 3.3) |
| Custom header с `text-title-md` + back + dummy `<View w-10/>` справа | Каждый экран свой размер → визуальная рассогласованность | `<ScreenHeader title onBack rightAction />` (раздел 3.1) |
| Inline expandable filter block с chip-row внутри tab-screen | На mobile занимает половину экрана, тесно | Полноэкранная страница `/filters` (архетип 2.4) |
| Большая ink-card как кнопка вторичного действия (например «Посмотреть как клиент») | Доминирует над основным контентом | Compact ghost-link с Eye/иконкой 14px + `text-caption text-muted` |
| Stacked 3-row theme-switcher занимающий пол-экрана | Огромное пространство для редко-используемой настройки | `<ClientThemeSegmented />` (1 строка, 3 button) |
| Любой DiceBear-набор как avatar fallback | Выглядит «детским placeholder» и расходится с текущим продуктовым решением | Инициалы через общий `<Avatar>` и `src/lib/avatar.ts` |
| 4 фото портфолио inline-превью на профиле | Дублирует hero на /master/[id] + растит scroll | Карточка-trigger «Портфолио · N из 50 фото» → отдельный экран |
| `setTabBarHidden(true)` на tab-screen | Скрывает нижнее меню там где нужно навигировать между табами | `setTabBarHidden` ТОЛЬКО на detail / wizard / picker (архетипы 2.3-2.5) |
| Back-кнопка на tab-screen header | Tab-screens переключаются через нижнюю панель, не через back | Tab-screen → ScreenHeader без `onBack` |
| L1 вне `construction` + `home-services` в CURRENT | Universal TARGET ещё не включён | До rollout фильтровать через `src/lib/product-scope.ts`; порядок включения — `docs/UNIVERSAL_TASK_BOARD.md` |
| Показ «N откликов» на OrderRow в master-листингах (search / responded / assigned / dashboard) | Чужая конкурентная инфа, мастеру не нужно знать сколько у конкурентов | Передавать `showResponsesCount={false}` в OrderRow для всех master-side списков. Default `true` остаётся для клиента-владельца. |
| 0 padding между ScrollView header и контентом | Выглядит сжато | `pt-6` минимум для tab-pages |

---

## 7. Naming convention для AI-агентов

Когда user/AI говорит — **используй эти имена**:

| Что user может сказать | Реальное имя в коде |
|---|---|
| «хедер», «заголовок страницы», «верх экрана» | `<ScreenHeader>` (в `src/components/ui/ScreenHeader.tsx`) |
| «нижнее меню», «таб-бар», «панель снизу» | `<TabBar>` (`src/components/TabBar.tsx`) |
| «карточка заказа», «строка заказа в списке» | `<OrderRow>` (`src/components/OrderRow.tsx`) |
| «карточка мастера», «профиль глазами клиента» | screen `app/(tabs)/master/[id].tsx` |
| «фильтры» (для master/orders) | screen `app/(tabs)/orders/search/filters.tsx` + Zustand `useOrdersSearchFiltersStore` |
| «выбор категорий» | screen `app/(tabs)/orders/search/category-select.tsx` |
| «локация», «город+район», «где работает» | `<LocationPicker>` (новый order) или `<ServiceAreasSection>` (master profile) |
| «превью результата», «как видит клиент» | screen `app/(tabs)/master/[id].tsx` (же самый, что клиент видит) |
| «прайс-лист», «услуги мастера» | `<MasterServicesSection>` (`src/features/master-services/`) |
| «портфолио» (мастер) | `<PortfolioGrid>` + screen `app/(tabs)/profile/portfolio.tsx` |
| «иллюстрация», «hero c фигурами» | tinted bg + декоративные circles (раздел 3.5) — паттерн, не отдельный компонент |
| «тема светлая/тёмная» | `<ClientThemeSegmented>` |

---

## 8. Decision tree — «куда ставить новый функционал?»

```
Это новая страница?
├── Да
│   ├── Откуда туда заходить?
│   │   ├── Из нижнего меню (один тап) → новый Tab (см. TabBar.tsx + (tabs)/_layout.tsx)
│   │   ├── Из карточки в списке → Detail page (архетип 2.3)
│   │   ├── Из rightAction в header → Sub-page (архетип 2.4-2.5)
│   │   └── Из CTA-кнопки → Detail / Form (архетип 2.3 / 2.5)
│   └── Какой архетип? → Раздел 2 (5 типов)
└── Нет, это новый блок на существующей странице?
    ├── Список → новая row-компонента в стиле OrderRow (раздел 3.3)
    ├── Форма → секция в edit form (архетип 2.5)
    ├── Действие → secondary button или ghost-link (НЕ inkbutton)
    └── Promo / nudge → HelpCallout или hero-иллюстрация (раздел 3.5-3.6)
```

---

## 9. Связанные документы (где что лежит)

| Тема | Документ |
|---|---|
| Цвета, типографика, радиусы, токены | [`DESIGN.md`](DESIGN.md) |
| Иконки категорий (color SVG) | [`docs/ICONS.md`](docs/ICONS.md) |
| Кросс-платформенные правила (Expo+RN+Web) | [`CROSS_PLATFORM_RULES.md`](CROSS_PLATFORM_RULES.md) |
| Чек-лист закрытия UI-задачи | [`.claude/rules/design-quality.md`](.claude/rules/design-quality.md) |
| Когда искать референсы (Lazyweb) | [`.claude/rules/lazyweb-rules.md`](.claude/rules/lazyweb-rules.md) |
| Запуск preview, откладка серверов | [`.claude/rules/preview-rules.md`](.claude/rules/preview-rules.md) |
| Структура аккаунта мастера (БД + UI) | [`MASTER_ACCOUNT_SPEC.md`](MASTER_ACCOUNT_SPEC.md) |
| План миграции мастер-экранов | [`MASTER_REDESIGN_SPEC.md`](MASTER_REDESIGN_SPEC.md) |
| Таксономия + product scope | [`CATEGORIES_AND_PROFILES.md`](CATEGORIES_AND_PROFILES.md) |
| Карта локаций (8 городов + 4 района + 32 села) | [`docs/location-system.md`](docs/location-system.md) |
| Текущая classifieds-модель | [`docs/SIMPLE_FLOW.md`](docs/SIMPLE_FLOW.md) |
| Universal CURRENT/TARGET и rollout | [`docs/UNIVERSAL_TASK_BOARD.md`](docs/UNIVERSAL_TASK_BOARD.md) |

---

## 9b. Spec: единый экран «Услуги и цены» (TaskRabbit/Yandex/Avito pattern)

**Решение user 2026-05-15:** «У нас есть прайс-лист, у нас есть услуги и цены. Почему они разделены — не знаю. Давай уберём прайс-лист и весь функционал реализуем в услугах и ценах. Категории тоже добавим туда».

**До (3 разных места — путаница):**

| # | Где | Что делает |
|---|---|---|
| 1 | `/profile` → card «Категории» → `/(onboarding)/master-categories` | Выбор L2 категорий (до 5) |
| 2 | `/profile` → card «Услуги и цены» → `/profile/services-suggest` | Template-based выбор L3 услуг с автоценой |
| 3 | `/profile/edit-master` → inline `<MasterServicesSection>` (название «Прайс-лист») | Manual CRUD произвольной услуги (title + min/max цена + единица) |

**После (один экран):**

```
[ScreenHeader: «Услуги и цены»  | onBack | rightAction "+ Добавить" (категория)]
[ScrollView]
  [Section: «Категория 1» (например, Сантехника) с кнопкой ⋮ удалить]
    [Чек-листом L3 услуг этой L2:]
      [✓] Замена смесителя         [от 1500 ₽]
      [✓] Установка унитаза        [от 4500 ₽]
      [ ] Прочистка канализации    [от 2000 ₽]   ← unchecked, не делает
      [✓] Своя услуга «Замена бачка»  [от 800 ₽]   ← custom, через footer-кнопку «Свой пункт»
  [Section: «Категория 2» (Электрика) ...]
  [Footer: «+ Добавить категорию» — открывает PickerSheet с L2-списком]
```

**Поведение:**
- Тап чек-бокса L3 → услуга добавляется в master_services (insert) с авто-ценой = `categories_l3.avg_check_rub * 0.7`. Снятие → удаление (delete).
- Тап на price → inline-edit (TextInput).
- Тап на ⋮ возле L2 header → BottomSheet «Удалить категорию?» (cascade удалит и L3 услуги этой L2).
- Footer «+ Своя услуга» в каждой секции → инпут для кастомного названия + цена.
- Footer «+ Добавить категорию» открывает PickerSheet с доступными L2 (минус уже добавленные, лимит 5).

**Эталоны UX:**
- **Яндекс Услуги**: каталог + checkbox-выбор + per-row цена. Минимум 1 услуга = виден в выдаче.
- **TaskRabbit Tasker**: skill list, каждая = hourly rate.
- **Avito Услуги**: услуга = title + категория + цена (range). Прайс-лист отдельной вкладкой не делают.

**Что удаляется из проекта:**
- `/profile` card «Категории» (отдельная) — функционал переезжает на «Услуги и цены».
- `/profile/services-suggest` — переезжает в новый экран.
- `<MasterServicesSection>` inline в edit-master — удаляется (master уже не вводит услуги в форме профиля; для этого есть отдельный экран).
- `/(onboarding)/master-categories` — остаётся для онбординга (первичный выбор минимум 1 категории), но из profile-меню убирается.

**БД:**
- Таблица `master_services` уже привязана к `l2_id` + `l3_id` (миграция 0056). Не меняем.
- Таблица `master_categories` — связка master ↔ L2. Не меняем.
- При тапе чек-бокса L3 — upsert `master_services { master_id, l2_id, l3_id, title=L3.name_ru, price_min=suggestedPrice(L3) }`. При снятии — delete by `(master_id, l3_id)`.

**Файлы (план реализации):**
- `app/(tabs)/profile/services.tsx` — новый экран (replacement for services-suggest).
- `app/(tabs)/profile/services-suggest.tsx` — удалить.
- `src/features/master-services/MasterServicesSection.tsx` — удалить из edit-master.
- `app/(tabs)/profile/edit-master.tsx` — убрать `<MasterServicesSection>`, оставить только базовые поля (имя, фамилия, bio, опыт, has_tools/transport).
- `app/(tabs)/profile/index.tsx` — убрать card «Категории», переименовать «Услуги и цены» → ведёт на `/profile/services` (новый).

---

## 10. История паттернов (decision log)

| Дата | Паттерн | Решение | Why |
|------|---------|---------|-----|
| 2026-09-02 | OrderRow = карточка, единая для всех лент | Карточка `rounded-2xl border-hairline p-4`, заголовок 18, факты 16 с иконками в `ink`, цена 18, минимум 14; скелет повторяет форму | Владелец на устройстве: «шрифты слишком мелкие, один общий стиль, как у референса (Thumbtack)». Заменяет full-bleed строку 2026-05-15 для лент заданий. |
| 2026-09-02 | «Мои задания» = заголовок 32 + одно действие + сегменты со счётчиками | Акцентный круглый «+», сегменты «Задания · N / Отклики · N», карточки, пустые состояния с `Button accent lg` | Владелец: «полный редизайн, и UX, и UI». Было два заголовка с одним словом и серые CTA. |
| 2026-09-02 | Auth-формы = `Input` с заливкой и акцентным фокусом + `Button accent lg` | Поле 54 pt / 17 px, лейбл 16 semibold `ink`, ссылки 16 `accent`, ошибка сервера в `error-soft` | Владелец: «всё бело-белое, непонятно, что где нажимать». |
| 2026-09-02 | Главная без закреплённого поиска | `HomeSearchField`, экран `/search`, `use-searchable-services`, `SearchBar` удалены — входов не осталось | Владелец: «полоску полностью убрать». Мёртвый код не хранится. |
| 2026-05-15 | ScreenHeader как стандарт | Применён на `/orders/search`, `/orders` (M+C), `/profile`; исторический `/chats` позднее удалён | Раньше каждый экран имел свой custom header — рассогласованность размеров и поведения. Унификация через единый компонент. |
| 2026-05-15 | Selected chip = accent, не ink | Замена `border-ink bg-ink` на `border-accent bg-accent-soft` в 12 файлах (20 occurrences) | User-фидбек: «черные кнопки не делай». Vercel-link blue (`#0070f3`) согласуется с status-цветом «Открыта». |
| 2026-05-15 | OrderRow = list-style full-bleed | Убрана обводка + rounded, добавлен `border-b` разделитель + встроенный `px-5 py-4`, иконка 32px | User-фидбек: «карточку от левого до правого края, серая линия между, иконку маленькую». |
| 2026-05-15 | Filter screen = отдельный full-screen, не inline | Создан `/orders/search/filters.tsx` с Zustand-store | Inline expandable block занимал пол-экрана, mobile UX страдал. Отдельная страница даёт место для всех фильтров + sticky CTA. |
| 2026-05-15 | TabBar middle slot = role-aware | Client → «Создать», Master → «Поиск» (с подсветкой по pathname + взаимоисключение с «Заказы») | У клиента и мастера разные критичные действия. Унифицированный «+» вводил в заблуждение мастера. |
| 2026-05-15 | Profile master без back, с Pencil rightAction | `<ScreenHeader title="Профиль" rightAction={Pencil → edit-client}>` | Tab-screen не должен иметь back. Edit вынесен в right action чтобы не делать большой ink-button «Редактировать». |
| 2026-05-15 | Theme = compact segmented для всех ролей | Master тоже использует `<ClientThemeSegmented>` (3-button row) вместо 3-stacked | User-фидбек: «тему не такую огромную». Stacked занимал пол-экрана. |
| 2026-05-15 | «Вся Ингушетия» toggle-карточка сверху | Эквивалент пустого выбора `cities=[], districts=[]` = «нет территориального фильтра» | User-фидбек: «добавь один который покрывает всё — Ингушетия». Унифицирован с клиентскими `LocationPicker` / `LocationSheet`. |
| 2026-05-15 | Product scope был сужен | Историческое решение; позднее CURRENT стал `construction` + `home-services` | Актуальный список всегда читать из `src/lib/product-scope.ts`, а не из этой строки истории. |
| 2026-08-23 | Universal TARGET | Search-first L1→L2→L3 picker, unknown path и auth-return | Полный контракт — `docs/UNIVERSAL_TASK_BOARD.md`; CURRENT не расширять преждевременно. |

**Расширение этого decision log = новые правки этого файла.** Если меняешь паттерн — обнови соответствующий раздел и добавь строку в этот лог.
