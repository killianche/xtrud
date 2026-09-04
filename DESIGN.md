# xtrud — Design system

**Активен с 2026-05-13.** Базируется на Vercel design language (`getdesign@latest add vercel`) с тремя осознанными override'ами для consumer-marketplace, см. секцию «xtrud overrides» ниже. Старые системы (Cal.com-inspired) перенесены в `archive/legacy/DESIGN_CALCOM.md` и `archive/legacy/DESIGN_SYSTEM.md`.

## xtrud overrides (отступления от Vercel)

| Override | Vercel | xtrud | Зачем |
|---|---|---|---|
| **Радиус карточек** | `rounded.md = 8px`, `lg = 12px` | Дефолт для всех карточек мастеров/категорий — **12px (lg)**. Кнопки — pill как у Vercel. | Vercel острый = dev-tool feel. Marketplace consumer-faceing нужно теплее, ближе к TaskRabbit/Airbnb. |
| **Цветные mesh-градиенты** | Используются по всему сайту для hero/feature bands | **Только в одном месте** — hero на главной экрана (тонкий accent). Везде ещё — чёрный/белый. | Mesh-gradient это бренд-сигнал Vercel. Для xtrud — это вкрапление, не основа. |
| **Caption mono** | Декоративный technical label | **Активный паттерн** для цифр в карточках: «★ 4.9 (123)», «от 2 500 ₽», «12 км», «3 года опыта». | Это и Vercel-character, и читаемость метрик. По принципу «фото — главный визуальный нерв» (PRODUCT_CONTEXT) цифры идут вторым нервом. |

Все остальные токены — буква в букву из Vercel (см. ниже).

## Минимальные размеры шрифта (a11y + product-quality)

Apple HIG / Material / WCAG сходятся: текст < 12px нечитаем на мобильном, body должен быть 14–16. Для marketplace это критично — пользователь читает имя мастера, цены, отзывы на 5–6-дюймовом экране при ярком свете.

**Шкала по назначению:**

| Назначение | Размер | Token (NativeWind) | Пример |
|---|---|---|---|
| **Абсолютный минимум** | 12px | `text-caption`, `text-mono-caption` | Бейджи статуса, мелкие метки счётчиков. Меньше **запрещено**. |
| **Body / списки / описания** | 14px | `text-body-sm`, `text-mono-body` | Bio мастера, второстепенная мета (опыт, отзывы), цены в списке. |
| **Критичная инфа** | 16px | `text-body-md`, `text-title-md`, `text-button-lg` | Заголовки карточек, цены в детальной карточке, основной CTA. |
| **Имена / sub-header** | 18px | `text-body-lg`, `text-title-lg` | Имя мастера в списке, заголовок секции. |
| **Display H1–H3** | 20–48px | `text-display-sm/md/lg/xl` | Hero-заголовки экрана. |

**Правила:**

1. **Никогда** не использовать `fontSize` < 12px. Если кажется, что не помещается — менять плотность или layout, не размер.
2. Для **mono-цифр** (рейтинг / цена / расстояние / опыт): минимум `text-mono-caption` (12px) для бейджей и `text-mono-sm` (13px) для inline-меты, **14px (`text-mono-body`)** — для критичных цен в листинге.
3. **Имя мастера в листинге — `text-body-lg` (18px) semibold.** Это primary visual anchor карточки, не сжимаем до 16px ради компактности.
4. **Цена в листинге — `text-mono-body` (14px).** 12px было неприемлемо мало для критической инфы (фидбэк user 2026-05-14).
5. Если строка не помещается на одну линию — `numberOfLines={1}` + `flex-shrink`, **не уменьшение шрифта**.
6. Кнопки (тач-таргет): `text-body-sm` (14px) для compact, `text-body-md` (16px) для primary CTA. Высота тача — минимум 40px.

**Anti-pattern:** `text-caption-xs` (10px) — удалён из шкалы. Если видишь в коде — заменить на `text-caption` (12px).

## Semantic-расширение (нет в Vercel, нужно нам)

Vercel — dev-tool без понятий «success/warning/error для бизнес-операций». Добавляю semantic-цвета поверх:

```yaml
semantic:
  success: "#10b981"    # green-500
  success-soft: "#d1fae5"
  warning: "#f59e0b"    # amber-500
  warning-soft: "#fef3c7"
  error: "#ee0000"      # = vercel `error` (тут совпало)
  error-soft: "#f7d4d6"
```

Используются для статуса заказа (open/in_progress/cancelled/done), бейджей уведомлений, валидации форм.

## Cross-platform контракт

xtrud — Expo + react-native-web. Все компоненты должны рендериться идентично на iOS / Android / web:
- Цвета через `useThemeColors()` хук (резолвит из `src/lib/colors.ts`)
- На web Tailwind-классы `text-ink`, `bg-canvas` работают через CSS-переменные из `global.css`
- CSS-переменные **авто-генерируются** из `colors.ts` (`npm run tokens`). НЕ редактировать руками.

## UI patterns (обязательны для всех экранов)

Эти паттерны зафиксированы 2026-05-15 после фидбэка пользователя «хедеры мелкие, разные на разных экранах, фильтры неудобные». Любое отклонение требует явного согласования и обновления этой секции.

### 1. ScreenHeader — единый хедер для всех full-screen detail-экранов

**Что:** компонент `<ScreenHeader>` из `@/components/ui` (`src/components/ui/ScreenHeader.tsx`).

**Когда использовать:**
- На **любом** full-screen экране, где есть back-кнопка и заголовок: master/[id], category/[id], orders/search, orders/[id], chats/[id], orders/category-select, profile/edit-master, useful/[slug], admin, и любых других detail-экранах.
- На табах (когда экран — корень таба): без `onBack`, только заголовок и опц. `rightAction`. Пример: `/orders/search`.

**Когда НЕ использовать:** modal-overlay'и, tab-bar'ы, cards, in-flow секции — для них свои стандарты.

**Стандарт (фиксирован, не править без согласования):**
- **Высота:** 64 px (визуально крупный).
- **Back-кнопка:** `h-12 w-12` (48×48 — минимум a11y), `ChevronLeft` 28 px, stroke 2.25, `bg-canvas-soft` при active.
- **Title:** `text-display-md` (24 px) `tracking-tight` `weight=bold` (700), `numberOfLines={1}`.
- **Gap title от back:** `gap-2`.
- **RightAction (опц.):** `h-11 px-4 rounded-pill` border-hairline. Активное состояние (`active: true`) — `border-ink bg-ink` + `text-on-primary`. Иконка слева 16 px stroke 2.

**API:**

```tsx
<ScreenHeader title="Поиск заказов" onBack={goBack} />

<ScreenHeader
  title="Поиск заказов"
  onBack={goBack}
  rightAction={{
    label: "Фильтры",
    Icon: SlidersHorizontal,
    onPress: () => router.push("/orders/search/filters"),
    active: hasActiveFilters,
  }}
/>
```

**Anti-patterns (запрещено):**
- ❌ Ad-hoc inline `<View><Pressable>...</Pressable><AppText>...</AppText></View>` — ломает консистентность, возникает «мелкий хедер».
- ❌ `text-title-lg` или `text-title-md` для title — должно быть `text-display-md`.
- ❌ Back-кнопка `h-9 w-9` или `h-10 w-10` — должно быть `h-12 w-12`.
- ❌ `ChevronLeft size={20}` или `size={24}` — должно быть `size={28}`.

### 2. Button-trigger для выбора одной/нескольких сущностей (вместо chip-row)

**Когда:** на формах и фильтрах, когда нужно выбрать категорию / город / период / другое из 5+ опций.

**Что вместо:** **не** показывать сразу горизонтальную скроллируемую chip-row («Сантехник», «Электрик», «Плитка», …) — это даёт ощущение «список в списке» и не масштабируется.

**Стандарт:**
- Кнопка-trigger `h-14`, `rounded-md`, `border-hairline`, `bg-canvas`, `px-4`.
- Внутри слева — текущее значение или placeholder; справа — `ChevronDown` 20 px stroke 1.75 `color={mute}`.
- Если ничего не выбрано → `text-mute` placeholder («Выберите категории», «Город», …).
- Если выбрано — двухстрочный layout: `text-caption text-muted` сверху («Выбрано N»), `text-body-md text-ink medium` снизу с самим значением (или первые 2 + «и ещё N»).
- Тап → `router.push("…/category-select")` на отдельный full-screen picker.

**Пример:** см. `app/(tabs)/orders/search/filters.tsx` (categories trigger → /search/category-select).

**Anti-pattern:** ❌ Bottom-sheet с длинным списком категорий. На малых экранах sheet занимает 60% и закрывает контекст; full-screen picker удобнее.

### 3. Full-screen filter / picker экраны

**Когда:** фильтры списка содержат 3+ группы (сортировка + категории + регион / срочность) **или** одна группа имеет 5+ опций.

**Стандарт:**
- Отдельный route `…/filters` (или `…/category-select`), не expandable inline-блок над списком.
- `<ScreenHeader title="…" onBack={…} />` сверху.
- Группы фильтров сверху вниз, между группами `mt-8`, между title и chip-row `mt-3`.
- Sticky footer с `<Button variant="primary" size="lg" fullWidth>` «Применить · N» (N — количество активных фильтров).
- При count=0 → label «Применить» без счётчика.
- Reset-ссылка («Сбросить все фильтры») — текстовая, `text-link`, `weight=medium`, `text-body-md` (НЕ кнопка), показывается только при `activeCount > 0`.
- Чипы-фильтра — `h-11 px-4 rounded-pill`, `border-hairline` для unselected, `border-ink bg-ink` + `text-on-primary` для selected.
- TabBar **скрыт** на этих экранах через `useTabBarVisibility((s) => s.setHidden)` в `useFocusEffect` (это full-screen UX, нижняя панель отвлекает).

**State:** Zustand-store, не `useState` в компоненте. Иначе при переходе между filters → category-select → back state теряется.

```ts
// Пример: src/features/orders/orders-search-filters-store.ts
export const useOrdersSearchFiltersStore = create<State>((set) => ({
  l2Ids: [],
  l1Id: null,
  sort: "newest",
  // ...
  clearAll: () => set({ l2Ids: [], l1Id: null, sort: "newest" }),
}));
```

**Multi-select picker** (примерно `app/(tabs)/orders/search/category-select.tsx`):
- Локальная Set'ка `selected`, инициализируется из стора.
- Тап по строке → toggle (✓-индикатор справа: `h-7 w-7 rounded-full border-ink bg-ink` с `Check 16 stroke 2.5 white`).
- Sticky footer «Применить · N» → пишет `Array.from(selected)` в стор и `goBack()`.
- RightAction в хедере «Сбросить» — показывается только при count > 0.

### 4. Когда таб vs detail: правила хедера и TabBar

| Тип экрана | TabBar | Back-кнопка | Заголовок |
|---|---|---|---|
| **Корневой экран таба** (`/orders/index`, `/profile/index`, `/orders/search` если в TabBar) | Виден | НЕ показывать (`<ScreenHeader title="…" />` без `onBack`) | `<ScreenHeader>` с display-md |
| **Detail внутри таба** (`/orders/[id]`, `/master/[id]`, `/orders/search/filters`) | Скрыт через `useFocusEffect` | Показывать (`<ScreenHeader title="…" onBack={goBack} />`) | `<ScreenHeader>` с display-md |
| **Modal / sheet** | n/a | n/a | свой стандарт |

`goBack` — через `useSafeBack("/(tabs)/...")` с фолбэком на родителя (для deeplink / refresh).

### 5. Документировать в коде (header-comment)

Каждый новый detail-экран начинается с шапки 5–15 строк, объясняющей **почему** именно так, со ссылкой на этот раздел DESIGN.md. Пример:

```tsx
// /orders/search/filters — full-screen экран фильтров для глобального поиска заказов.
//
// Эталон UX (фидбек user 2026-05-15 + референс-скриншоты):
//   - Полный экран (не expandable inline) — больше места, удобнее на mobile.
//   - Header через <ScreenHeader> (back + title display-md + опц. action).
//   - Категория НЕ перечислена сразу — кнопка-trigger «Выберите категории»
//     с chevron, при тапе → full-screen picker.
//   - Sticky footer с большой primary-кнопкой «Применить» + ссылкой «Сбросить».
```

### 6. UI-иконки — Phosphor (моно)

Все моно UI-иконки (TabBar, ScreenHeader back, кнопки, chips, status, list-chevrons, form-fields) — **Phosphor React Native** (`phosphor-react-native`). Lucide — только legacy, в новом коде не использовать.

Правила weights:
- **Inactive / outline:** `weight="bold"`
- **Active / selected / status-fill:** `weight="fill"`
- `regular`/`light`/`thin` — не использовать в production UI (слабая читаемость на mobile).

Active state в navigation = `fill` + ink color + pill-подложка `bg-canvas-soft-2` (px-14 py-1 rounded-full). См. [`src/components/TabBar.tsx`](src/components/TabBar.tsx).

**Полная инструкция, маппинг Lucide → Phosphor, anti-patterns:** [`docs/UI_ICONS.md`](docs/UI_ICONS.md). Цветные иконки L2-категорий — отдельный документ [`docs/ICONS.md`](docs/ICONS.md) (Iconify CDN, не Phosphor).

## Активная палитра — оригинал из Vercel ниже

---

version: alpha
name: Vercel-design-analysis
description: An inspired interpretation of Vercel's design language — a developer-platform brand whose surface is a stark black-and-ink duet on near-white canvas, broken at hero scale by a multi-color mesh gradient (cyan / blue / magenta / amber) that acts as the entire decorative system, paired with a custom geometric sans for headlines and a monospaced caption face for technical labels.

colors:
  primary: "#171717"
  on-primary: "#ffffff"
  ink: "#171717"
  body: "#4d4d4d"
  mute: "#888888"
  hairline: "#ebebeb"
  hairline-strong: "#a1a1a1"
  canvas: "#ffffff"
  canvas-soft: "#fafafa"
  canvas-soft-2: "#f5f5f5"
  link: "#0070f3"
  link-deep: "#0761d1"
  link-bg-soft: "#d3e5ff"
  success: "#0070f3"
  error: "#ee0000"
  error-soft: "#f7d4d6"
  error-deep: "#c50000"
  warning: "#f5a623"
  warning-soft: "#ffefcf"
  warning-deep: "#ab570a"
  violet: "#7928ca"
  violet-soft: "#d8ccf1"
  violet-deep: "#4c2889"
  cyan: "#50e3c2"
  cyan-soft: "#aaffec"
  cyan-deep: "#29bc9b"
  highlight-pink: "#ff0080"
  highlight-magenta: "#eb367f"
  gradient-develop-start: "#007cf0"
  gradient-develop-end: "#00dfd8"
  gradient-preview-start: "#7928ca"
  gradient-preview-end: "#ff0080"
  gradient-ship-start: "#ff4d4d"
  gradient-ship-end: "#f9cb28"
  selection-bg: "#171717"
  selection-fg: "#f2f2f2"

# ⚠️ ОБНОВЛЕНО 2026-05-23 — ОСНОВНОЙ ШРИФТ ТЕПЕРЬ СИСТЕМНЫЙ (НЕ Geist).
# По решению владельца «супер стандартный и везде быстро открывающийся шрифт».
# Везде используется системный стек (ноль загрузки, мгновенный рендер):
#   sans:  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
#   mono:  ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
# То есть iOS/macOS/Safari → SF Pro; Windows → Segoe UI; Android → Roboto.
# `fontFamily: Geist...` в таблице ниже — ИСТОРИЧЕСКОЕ, фактический источник истины
# по шрифту — src/components/AppText.tsx + tailwind.config.ts (там системный стек).
# Размеры/веса/трекинг из таблицы остаются в силе.

typography:
  display-xl:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 48px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1.28px
  display-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.96px
  display-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.6px
  body-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  body-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
  body-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.28px
  body-sm-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.28px
  caption:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  caption-mono:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  code:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  button-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  button-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill-sm: 64px
  pill: 100px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 96px
  6xl: 128px
  section: 192px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: 64px
    padding: "{spacing.sm} {spacing.lg}"
  nav-link:
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs} {spacing.sm}"
  nav-cta-signup:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.xs}"
    height: 28px
  nav-cta-login:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.xs}"
    height: 28px
  nav-cta-ask-ai:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.xs}"
    height: 28px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
  button-primary-sm:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.xs}"
  button-secondary-sm:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.xs}"
  tab-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill-sm}"
    padding: "0px {spacing.md}"
  icon-button-circular:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.full}"
  card-marketing:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  card-marketing-large:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  card-soft:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  template-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  code-editor-mockup:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  form-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 40px
  form-input-sm:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 32px
  form-input-lg:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 48px
  badge-secondary:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.body}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px {spacing.xs}"
  pricing-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  pricing-card-featured:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  logo-strip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: "{spacing.lg} {spacing.xl}"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "{spacing.4xl} {spacing.lg}"
  feature-mesh-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  showcase-band-light:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  showcase-band-dark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: "{spacing.4xl} {spacing.lg}"
  link-inline:
    textColor: "{colors.link}"
    typography: "{typography.body-md}"
  banner-marketing:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs} {spacing.sm}"

  # ─── Examples (illustrative) — auto-derived; resolve any TO_FILL markers below ───
  ex-pricing-tier:
    description: "Default tier card. Mirrors pricing-card chrome on canvas-soft surface with a hairline border."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-pricing-tier-featured:
    description: "Featured tier — polarity-flipped to ink primary with white text and white CTA."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-product-selector:
    description: "What's Included summary card — repurposed for the brand's GPU / inference / Pro feature tiers."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  ex-cart-drawer:
    description: "Subscription summary — line items per add-on (NOT a literal e-commerce cart)."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    item-divider: "{colors.hairline}"
  ex-app-shell-row:
    description: "Sidebar nav row. Active state uses brand primary as a left-edge indicator bar."
    backgroundColor: "{colors.canvas}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.sm}"
  ex-data-table-cell:
    description: "Mirrors the brand's table chrome. Header uses caption-mono uppercase mono; body uses body-sm."
    headerBackground: "{colors.canvas-soft}"
    headerTypography: "{typography.caption-mono}"
    bodyTypography: "{typography.body-sm}"
    cellPadding: "{spacing.xs} {spacing.sm}"
    rowBorder: "{colors.hairline}"
  ex-auth-form-card:
    description: "Sign-in / sign-up card. Mirrors card-marketing-large chrome with form-input primitives inside."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-modal-card:
    description: "Modal dialog surface — same chrome as card-marketing-large with Level 5 modal shadow."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-empty-state-card:
    description: "Empty-state illustration frame. Generous padding on canvas-soft."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.3xl}"
    captionTypography: "{typography.body-md}"
  ex-toast:
    description: "Toast notification surface — flat-cornered card-marketing chrome with Level 4 shadow."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.body-sm}"

---


## Overview

Vercel is a developer-platform brand — the page is a deployment dashboard's marketing surface, written for engineers who already know the syntax. It earns that posture with one of the cleanest stark systems on the web: near-white `{colors.canvas-soft}` body background, ink-near-black `{colors.ink}` text, a 200-step gray scale that gives every divider, border, and disabled state its own deliberate step. The only place the brand introduces colour at marketing scale is the multi-stop mesh gradient (`{colors.gradient-develop-start}` → `{colors.gradient-preview-end}` → `{colors.gradient-ship-start}` → cyan / magenta / amber) that floats in atmospheric backdrops, never miniaturised to a swatch. That gradient is the entire decoration system.

Type is the second decisive voice. The brand's own custom geometric sans (Geist) carries display, body, button — everything narrative — at weight 600 for display, 500 for buttons, 400 for body. A matching monospaced face (Geist Mono) carries technical labels: terminal mockups, code blocks, sometimes filename captions. Headlines are sentence-case with aggressive negative letter-spacing (`-2.4px` at 48 px hero) — the brand never letter-spaces positively, never goes uppercase outside of mono labels.

Surfaces use a four-step ladder: `{colors.canvas}` (pure white for cards), `{colors.canvas-soft}` 98% (the page body), `{colors.canvas-soft-2}` 95% (occasional inset region), `{colors.primary}` (the deep ink-near-black used as the polarity-flipped band when a section needs the dark mode treatment). Shadows are exceptionally subtle — every elevated card carries a stacked shadow built from `0px 1px 1px #00000005` + `0px 2px 2px #0000000a` + an inset border. Cards never float on heavy drop-shadow; they sit on the page held by hairline + soft glow.

**Key Characteristics:**
- A single black-ink primary CTA `{colors.primary}` carries every conversion target, paired with white-on-white `button-secondary` for the secondary action. The brand uses 100 px pill shape for marketing CTAs and a tight 6 px square shape for in-app nav buttons.
- A multi-stop mesh gradient (cyan-blue-magenta-amber) is the only decorative chrome — used at hero scale and inside feature-band atmospheric backdrops. It is the brand.
- Every section eyebrow and small label uses the monospace face `{typography.caption-mono}` or `{typography.code}`; everything else is in the geometric sans.
- Subtle stacked-shadow elevation — three offsets layered with 4-12 % black opacity — never a single heavy drop-shadow.
- A complete 100–1000 gray + blue + red + amber + green + teal + purple + pink colour scale exists as a system token set, but the marketing surface uses only the `100`, `1000`, and `700`-level tones; the rest stay in the design-system tokens for in-product surfaces.
- An "Active CPU" pricing rhythm: `pricing-card` lays out 3-up on the pricing page with `pricing-card-featured` (Pro tier) polarity-flipped to `{colors.primary}` against white-card siblings.

## Colors

### Brand & Accent
- **Ink** (`{colors.primary}` — `#171717`): The single primary CTA color. Black-near-pure ink that carries every Sign Up pill, every footer CTA, the dark-band polarity-flip. Used as text color throughout the page on light surfaces. (Resolved from `--ds-gray-1000`.)
- **Cyan** (`{colors.cyan}` — `#50e3c2`): A signature mint-cyan used in the brand gradient and inside Geist-system spotlight tokens. Visible inside the hero gradient stops.
- **Highlight Pink** (`{colors.highlight-pink}` — `#ff0080`): The brand's highlight magenta, used as the high-saturation stop in the preview-gradient pair.
- **Violet** (`{colors.violet}` — `#7928ca`): The deep purple used as the start of the preview-gradient and inside developer-console highlights.
- **Link Blue** (`{colors.link}` — `#0070f3`): The brand's primary link color and the legacy `--geist-success` semantic.

### Surface
- **Canvas** (`{colors.canvas}` — `#ffffff`): The pure-white card / dialog / modal surface.
- **Canvas Soft** (`{colors.canvas-soft}` — `#fafafa`): The default page background — 98 % white. Almost every section sits on this tone.
- **Canvas Soft 2** (`{colors.canvas-soft-2}` — `#f5f5f5`): A slightly deeper inset surface for "code editor inner background", template-card hover states, and dropdown menus.
- **Hairline** (`{colors.hairline}` — `#ebebeb`): 1 px dividers — table rows, card borders, input borders.
- **Hairline Strong** (`{colors.hairline-strong}` — `#a1a1a1`): The 500-level gray, used as the slightly-stronger divider on light bands and as the deemphasised text color.

### Text
- **Ink** (`{colors.ink}` — `#171717`): Every heading and body paragraph on light surfaces.
- **Body** (`{colors.body}` — `#4d4d4d`): Secondary text — sub-headings, body captions, nav-link inactive text, footer column body.
- **Mute** (`{colors.mute}` — `#888888`): Lowest-priority text — placeholder text, fine print, low-key labels.
- **On Primary** (`{colors.on-primary}` — `#ffffff`): All text on `{colors.primary}` surfaces.

### Semantic
- **Success / Link** (`{colors.success}` — `#0070f3`): The brand's legacy success indicator doubles as the primary link color. Visible underline-on-hover for inline body links.
- **Link Deep** (`{colors.link-deep}` — `#0761d1`): The pressed / visited tone for inline links.
- **Link Bg Soft** (`{colors.link-bg-soft}` — `#d3e5ff`): Soft pastel blue fill for "what's new" pill banners and informational badges.
- **Error** (`{colors.error}` — `#ee0000`): Validation red for destructive actions and form errors.
- **Error Soft** (`{colors.error-soft}` — `#f7d4d6`): Soft pastel red for destructive-state backgrounds.
- **Error Deep** (`{colors.error-deep}` — `#c50000`): Pressed / deep destructive state.
- **Warning** (`{colors.warning}` — `#f5a623`): Caution / pending status indicator.
- **Warning Soft** (`{colors.warning-soft}` — `#ffefcf`) / **Warning Deep** (`{colors.warning-deep}` — `#ab570a`): Background + pressed variants.

### Brand Gradient
The brand's signature decoration is a three-pair gradient stack:
- **Develop** (`{colors.gradient-develop-start}` `#007cf0` → `{colors.gradient-develop-end}` `#00dfd8`) — the blue-to-teal pair used to mark the "deploy" / "develop" rhythm.
- **Preview** (`{colors.gradient-preview-start}` `#7928ca` → `{colors.gradient-preview-end}` `#ff0080`) — the violet-to-pink pair used for "preview" surfaces.
- **Ship** (`{colors.gradient-ship-start}` `#ff4d4d` → `{colors.gradient-ship-end}` `#f9cb28`) — the coral-to-amber pair used for "ship" surfaces.

The three pairs collapse into a single multi-color mesh gradient when used as the hero atmospheric backdrop. Treat the gradient as one unified object — do not crop down to a single colour, do not reorder the stops, and do not miniaturise. Used at hero scale only.

## Typography

### Font Family
Two custom faces carry the entire system:

1. **A custom geometric sans** (extracted as `Geist`) for every display, body, button, link, and label. Weights 400 / 500 / 600 are the working set; the face never appears in 700 or heavier. Display sizes are tracked aggressively negative (`-2.4 px` at 48 px hero, `-1.28 px` at 32 px section); body stays at neutral or slightly-negative tracking.
2. **A custom monospaced face** (extracted as `Geist Mono`) for terminal mockups, code blocks, and small mono-caption labels — anything that wants to signal "technical." Weight 400 only at 12 – 13 px. Tracking neutral.

A condensed display sans (`Space Grotesk`) is loaded as a third face for occasional editorial moments but does not render as the primary face anywhere in the captured surfaces.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 48px | 600 | 48px | -2.4px | Hero headline ("Build and deploy on the AI Cloud."). |
| `{typography.display-lg}` | 32px | 600 | 40px | -1.28px | Section headlines ("Your frontend, delivered.", "A compute model for all workloads."). |
| `{typography.display-md}` | 24px | 600 | 32px | -0.96px | Card-cluster headlines, pricing-tier names. |
| `{typography.display-sm}` | 20px | 600 | 28px | -0.6px | Inline display micro-headings. |
| `{typography.body-lg}` | 18px | 400 | 28px | 0 | Lead paragraphs under section headlines. |
| `{typography.body-md}` | 16px | 400 | 24px | 0 | Default body paragraph. |
| `{typography.body-md-strong}` | 16px | 500 | 24px | 0 | Bolded inline body. |
| `{typography.body-sm}` | 14px | 400 | 20px | -0.28px | Secondary body, nav-link text, button-md labels. |
| `{typography.body-sm-strong}` | 14px | 500 | 20px | -0.28px | Nav CTA labels, table-row emphasis. |
| `{typography.caption}` | 12px | 400 | 16px | 0 | Footer secondary lines, badge labels. |
| `{typography.caption-mono}` | 12px | 400 | 16px | 0 | Section eyebrows and label captions that want a technical voice. |
| `{typography.code}` | 13px | 400 | 20px | 0 | Inline code, terminal mockups, command snippets. |
| `{typography.button-md}` | 14px | 500 | 20px | 0 | Small / nav-scale button labels. |
| `{typography.button-lg}` | 16px | 500 | 24px | 0 | Marketing-scale pill button labels. |

### Principles
- **Negative tracking is part of the voice.** Display sizes use aggressive `-2.4` to `-0.6` px tracking. Reverting to default tracking breaks the brand.
- **Sentence-case headlines, period-terminated.** Headlines like "Build and deploy on the AI Cloud." end with a deliberate period — that punctuation is part of the brand's voice.
- **Mono for the technical layer only.** Section eyebrows, code blocks, terminal mockups. Body paragraphs never set in mono.
- **Weight 600 is the display ceiling.** The geometric sans never appears at 700 / 800. The brand reads as a calmer system because of this.

### Note on Font Substitutes
The two primary faces are proprietary (custom-cut for the brand). Open-source substitutes:
- **Geometric sans** — *Inter* (400 / 500 / 600) is the closest stylistic match; `font-feature-settings: "ss01", "ss02"` enables the geometric alternates. *Satoshi* is a passable second choice.
- **Monospace** — *JetBrains Mono* (400) at 12 – 13 px matches the technical voice. *IBM Plex Mono* is the second-best option.

## Layout

### Spacing System
- **Base unit**: 4 px. The brand's `--geist-space` token is exactly 4 px and every captured value is a multiple of 4.
- **Tokens**: `{spacing.xxs}` 4 px · `{spacing.xs}` 8 px · `{spacing.sm}` 12 px · `{spacing.md}` 16 px · `{spacing.lg}` 24 px · `{spacing.xl}` 32 px · `{spacing.2xl}` 40 px · `{spacing.3xl}` 48 px · `{spacing.4xl}` 64 px · `{spacing.5xl}` 96 px · `{spacing.6xl}` 128 px · `{spacing.section}` 192 px.
- **Section padding**: marketing bands use `{spacing.4xl}` to `{spacing.5xl}` top/bottom. Hero bands stretch to `{spacing.section}` to give the mesh gradient room to breathe.
- **Card interior padding**: marketing cards sit at `{spacing.lg}` to `{spacing.xl}`; template-grid cards stay tighter at `{spacing.md}` because they sit in a denser grid.
- **Inline gap**: button rows, nav rows, and chip rows use `{spacing.sm}` to `{spacing.md}` between siblings. The brand's `--geist-gap` is exactly 24 px.

### Grid & Container
- **Max width**: ~1400 px (`--ds-page-width`); the legacy `--geist-page-width` is 1200 px and still appears on some marketing surfaces. Content centres with horizontal gutters of `{spacing.lg}` 24 px on desktop, `{spacing.md}` 16 px on mobile.
- **Column patterns**:
  - Three-feature row: 3-up at desktop, 1-up at mobile (rows like "Web Apps / Composable Commerce / Multi-tenant Platforms").
  - Tab pill row: 5-up centred row of `tab-ghost` pills.
  - Template-grid cluster: 5-up at desktop, scaling to 1-up at mobile.
  - Pricing tier grid: 3-up at desktop with the middle tier polarity-flipped.
  - Logo strip: ~5 logos wide, single row.

### Whitespace Philosophy
The mesh gradient does most of the heavy decorative lifting; whitespace separates the bands. Section spacing is generous — `{spacing.4xl}` to `{spacing.5xl}` between bands lets the gradient breathe. Inside a card, the headline/paragraph stack is tight (`{spacing.xs}` 8 px gap), then a wider gap before the CTA cluster. The page reads as engineered — large gaps + tight interior, never the other way around.

### Responsive Strategy

#### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 600px | Hero stacks; nav collapses to hamburger; 3-up feature grids drop to 1-up; tab pill row enables horizontal scroll. |
| Tablet | 600–959px | 3-up grids drop to 2-up; nav still horizontal. |
| Desktop | 960–1199px | Full 3-up grids; pricing 3-up. |
| Wide | 1200–1399px | Container caps at 1400 px content width. |
| Ultra-wide | ≥ 1400px | Content stays centred at 1400 px; bands stretch edge-to-edge in colour but content holds the max-width. |

#### Touch Targets
The `button-primary` pill renders at ~32 px tall in nav and ~48 px tall in marketing contexts. Marketing CTAs comfortably meet WCAG AAA at all breakpoints; nav buttons inflate touch area through `{spacing.xs}` padding on mobile to meet the 44 × 44 px floor.

#### Collapsing Strategy
- **Nav**: full link row + Ask AI / Log In / Sign Up pills at desktop. Collapses to logo + hamburger at mobile with the menu opening as a full-overlay.
- **Hero**: mesh gradient stays centred; headline + body stack vertically at all breakpoints (the brand doesn't use a split-hero pattern).
- **Three-feature row**: 3-up → 2-up → 1-up at the breakpoints above; cards keep their `{rounded.md}` 8 px shape across all viewports.
- **Pricing card grid**: 3-up at desktop, vertical stack at mobile with `pricing-card-featured` always sitting in the middle.
- **Template grid**: 5-up → 3-up → 2-up → 1-up. Each `template-card` keeps its 16:9 aspect on the image.

#### Image Behavior
- **Mesh gradient**: rendered as inline SVG or canvas-painted gradient; scales fluidly with the hero container; never crops, never tiles.
- **Customer logos**: rendered as monochrome SVGs in the logo strip; consistent 24 px height.
- **Code editor mockup**: dark `{colors.primary}` rectangle with mono text rendered inside; treated as an image at the layout level.
- **Template thumbnails**: 16:9 landscape inside `{rounded.md}` card chrome; lazy-loaded; consistent grayscale palette in the placeholder state.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Level 0 — Flat | No shadow, no border. | Full-bleed hero bands and the polarity-flipped dark sections. |
| Level 1 — Inset Hairline | `0 0 0 1px #00000014` inset 1 px border. | Default card chrome — the brand's universal "you can see this card" cue. |
| Level 2 — Subtle Drop | `0px 1px 1px #00000005, 0px 2px 2px #0000000a` plus inset hairline. | Slightly elevated cards (template-grid, marketing-card). |
| Level 3 — Soft Stack | `0px 2px 2px #0000000a, 0px 8px 8px -8px #0000000a` plus inset hairline. | The "medium" elevation — feature-grid cards. |
| Level 4 — Float Stack | `0px 2px 2px #0000000a, 0px 8px 16px -4px #0000000a` plus inset hairline. | "Large" elevation — pricing cards, callout panels. |
| Level 5 — Modal | `0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f` plus inset hairline. | Modal / dialog surfaces and dropdown menus. |

The brand uses STACKED shadows — multiple small offsets layered to fake natural light — never a single 8-px-blur generic drop. Inset hairline rings are always added so the card edge stays crisp.

### Decorative Depth
- **Mesh gradient as atmospheric depth**: the hero's multi-stop gradient is the brand's only "atmospheric" effect — applied as a flat 2-D backdrop rather than a 3-D illustration.
- **Polarity-flipped dark band as section-depth**: switching the surface from `{colors.canvas-soft}` to `{colors.primary}` (the deep ink) is the brand's chief depth cue between bands.
- **Inset-shadow + drop-shadow combo**: the cards' combination of an inset 1 px ring and a multi-stop drop produces a "card sits on the page" effect without ever feeling material-heavy.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Full-bleed hero / footer bands. |
| `{rounded.xs}` | 4px | Tightest inline pill — the `nav-cta-signup` 6-px-radius button (mapped to `xs/sm`). |
| `{rounded.sm}` | 6px | The brand's `--geist-radius` token — base UI radius for in-app buttons, form inputs, dropdown menus. |
| `{rounded.md}` | 8px | The brand's `--geist-marketing-radius` token — feature cards, template cards. |
| `{rounded.lg}` | 12px | Slightly larger card chrome (pricing-card variants). |
| `{rounded.xl}` | 16px | Largest card chrome — when a card hosts a hero image cap. |
| `{rounded.pill-sm}` | 64px | Tab-ghost pills inside the "AI Apps / Web Apps / Ecommerce / Marketing / Platforms" row. |
| `{rounded.pill}` | 100px | The marketing CTA pill — `button-primary`, `button-secondary`, "Start Deploying" pill. |
| `{rounded.full}` | 9999px | Icon-button circular containers, nav-link ghost pills. |

### Photography Geometry
- **Mesh gradient**: full-bleed 2-D atmospheric backdrop, never cropped to a frame; treated as the page's wallpaper.
- **Customer logos**: monochrome SVG, consistent 24 px height in a flex row.
- **Code editor mockup**: 16:10 dark rectangle, `{rounded.md}` corners.
- **Template thumbnails**: 16:9 landscape inside `{rounded.md}` chrome.
- **Showcase imagery**: 2:1 or 16:9 inside `{rounded.lg}` to `{rounded.xl}` chrome with a stacked shadow.

## Components

### Buttons

**`button-primary`** — the canonical 100-px-radius black pill, marketing scale.
- Background `{colors.primary}`, text `{colors.on-primary}`, label set in `{typography.button-lg}`, padding `0px {spacing.sm}` 12 px, shape `{rounded.pill}` 100 px. Renders ~48 px tall when paired with the marketing flex layout.

**`button-secondary`** — the white pill paired with the black primary inside marketing bands.
- Background `{colors.canvas}`, text `{colors.ink}`, same typography + padding as `button-primary`, shape `{rounded.pill}`.

**`button-primary-sm`** — the smaller-scale primary pill used inside nav and pricing-card CTAs.
- Background `{colors.primary}`, text `{colors.on-primary}`, label set in `{typography.button-md}` (14 px / 500), shape `{rounded.pill}`.

**`button-secondary-sm`** — the smaller-scale white pill paired with `button-primary-sm`.
- Background `{colors.canvas}`, text `{colors.ink}`, same typography + shape as `button-primary-sm`.

**`tab-ghost`** — the centred-row tab pill ("AI Apps / Web Apps / Ecommerce / Marketing / Platforms").
- Background `{colors.canvas}`, text `{colors.ink}`, label set in `{typography.body-sm}`, padding `0px {spacing.md}`, shape `{rounded.pill-sm}` 64 px.

**`icon-button-circular`** — the circular icon container (often a "?" or arrow inside).
- Background `{colors.canvas}`, dark icon, 1 px solid hairline border, shape `{rounded.full}`.

**Nav CTAs:**

**`nav-cta-signup`** — the small black "Sign Up" button in the nav row.
- Background `{colors.primary}`, text `{colors.on-primary}`, label `{typography.body-sm-strong}`, padding `0px {spacing.xs}`, height 28 px, shape `{rounded.sm}` 6 px (the brand's `--geist-radius`).

**`nav-cta-login`** — the white "Log In" button in the nav.
- Background `{colors.canvas}`, text `{colors.ink}`, same typography / height / shape as `nav-cta-signup`.

**`nav-cta-ask-ai`** — the small "Ask AI" button with a faint border.
- Background `{colors.canvas}`, text `{colors.ink}`, 1 px solid `{colors.hairline}` border (extracted as `0px solid rgb(235, 235, 235)`), same typography / height / shape.

### Cards & Containers

**`card-marketing`** — the canonical marketing feature card (3-up section cards).
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.lg}` 24 px, shape `{rounded.md}` 8 px (the `--geist-marketing-radius`). Carries Level 3 soft-stack shadow.

**`card-marketing-large`** — the larger marketing card used for "compute model" / "AI Gateway" callouts.
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.xl}`, shape `{rounded.lg}` 12 px. Carries Level 4 float-stack shadow.

**`card-soft`** — the soft-tinted card used inside cluster groups (lighter than canvas-soft).
- Background `{colors.canvas-soft}`, text `{colors.ink}`, padding `{spacing.lg}`, shape `{rounded.md}`.

**`template-card`** — the deploy-template card in the "Deploy your first app" grid.
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.md}` 16 px, shape `{rounded.md}` 8 px. Hosts a 16:9 thumbnail at the top.

**`code-editor-mockup`** — the dark code-preview surface inside marketing bands.
- Background `{colors.primary}`, text `{colors.on-primary}`, body in `{typography.code}` (13 px / Geist Mono), padding `{spacing.lg}` 24 px, shape `{rounded.md}` 8 px.

**`pricing-card`** — the default pricing-tier card.
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.xl}` 32 px, shape `{rounded.lg}` 12 px. Inside: tier name in `{typography.display-md}`, price in `{typography.display-xl}`, feature list in `{typography.body-md}` rows, CTA at the bottom.

**`pricing-card-featured`** — the polarity-flipped "Pro" tier card.
- Background `{colors.primary}`, text `{colors.on-primary}`, same shape + padding as `pricing-card`. CTA inverts to `button-secondary-sm` (white pill on black card).

### Inputs & Forms

**`form-input`** — the canonical text input.
- Background `{colors.canvas}`, text `{colors.ink}`, 1 px solid `{colors.hairline}` border, body in `{typography.body-sm}` (14 px), padding `0px {spacing.sm}`, height 40 px (the brand's `--geist-form-height`), shape `{rounded.sm}` 6 px.

**`form-input-sm`** — small-height variant (32 px tall) for tight forms.
- Same as `form-input` but height 32 px (the `--geist-form-small-height`).

**`form-input-lg`** — large-height variant (48 px tall) for hero CTAs.
- Same as `form-input` but height 48 px (the `--geist-form-large-height`); body in `{typography.body-md}` 16 px.

### Navigation

**`nav-bar`** — the sticky top nav.
- Background `{colors.canvas}`, text `{colors.ink}`, height 64 px (the brand's `--header-height`), padding `{spacing.sm} {spacing.lg}`. Layout: logo left, link row centre, "Ask AI / Log In / Sign Up" cluster right.

**`nav-link`** — the centred link row inside `nav-bar`.
- Text `{colors.body}`, set in `{typography.body-sm}`, padding `{spacing.xs} {spacing.sm}`, shape `{rounded.full}` (ghost pill — visible only on hover or active, but the radius is documented).

**`footer`** — the bottom 4-column nav.
- Background `{colors.canvas}`, text `{colors.body}`, padding `{spacing.4xl} {spacing.lg}`. Eyebrow column labels in `{typography.caption-mono}` (uppercase mono effect); link rows in `{typography.body-sm}`.

### Signature Components

**`hero-band`** — the white hero with the mesh gradient backdrop.
- Background `{colors.canvas}` (or `{colors.canvas-soft}` on some surfaces), text `{colors.ink}`, padding `{spacing.4xl} {spacing.lg}`. Inside: a small mono badge above the headline, the headline in `{typography.display-xl}` (sentence-case, period-terminated), a body lead in `{typography.body-lg}`, then a CTA row with `button-primary` + `button-secondary`. The mesh gradient sits behind, scaled to occupy roughly the top half of the band.

**`feature-mesh-band`** — the secondary section that hosts a mesh-gradient atmospheric backdrop with feature copy on top.
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.5xl} {spacing.lg}`. Section headline in `{typography.display-lg}`; supporting body in `{typography.body-md}`.

**`showcase-band-light`** — a soft-canvas section ("Deploy your first app in seconds").
- Background `{colors.canvas-soft}`, text `{colors.ink}`, padding `{spacing.5xl} {spacing.lg}`.

**`showcase-band-dark`** — the polarity-flipped dark band ("A compute model for all workloads").
- Background `{colors.primary}`, text `{colors.on-primary}`, padding `{spacing.5xl} {spacing.lg}`. Section headline in `{typography.display-lg}` (white on black). Often contains a `code-editor-mockup` flush with the band.

**`logo-strip`** — the customer-logo wrapping row near the top of the page.
- Background `{colors.canvas}`, text `{colors.body}`, padding `{spacing.lg} {spacing.xl}`. Logos rendered as monochrome SVGs at consistent height.

**`badge-secondary`** — the small inline metadata pill ("New", "Beta", "Live").
- Background `{colors.canvas-soft}`, text `{colors.body}`, body in `{typography.caption}`, padding `0px {spacing.xs}`, shape `{rounded.full}`.

**`banner-marketing`** — the "Introducing X" announcement pill at the top of pages.
- Background `{colors.canvas-soft}`, text `{colors.body}`, body in `{typography.body-sm}`, padding `{spacing.xs} {spacing.sm}`, shape `{rounded.full}`.

**`link-inline`** — body-copy inline links.
- Text `{colors.link}` (`#0070f3`), body in `{typography.body-md}`, underlined.

### Examples (illustrative)

> Auto-derived kit-mirror demonstration surfaces (`scripts/derive-examples-block.mjs`). Each `ex-*` entry references brand-native primitives so downstream consumers (`/preview-design`, `/generate-kit`) re-skin the same 10 surfaces consistently. `TO_FILL` markers indicate missing primitives — resolve in the LLM judgment pass.

**`ex-pricing-tier`** — Default Pricing tier card. Re-uses feature-card chrome with brand canvas-soft surface.
- Properties: `backgroundColor`, `textColor`, `borderColor`, `rounded`, `padding`

**`ex-pricing-tier-featured`** — Featured/highlighted tier — polarity-flipped surface (dark fill + light text in light mode, light fill + dark text in dark mode).
- Properties: `backgroundColor`, `textColor`, `rounded`, `padding`

**`ex-product-selector`** — What's Included summary card — re-purposed for SaaS / B2B verticals (NOT a literal product gallery).
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-cart-drawer`** — Subscription summary — re-purposed for SaaS / B2B (line items per add-on, not literal cart).
- Properties: `backgroundColor`, `rounded`, `padding`, `item-divider`

**`ex-app-shell-row`** — Sidebar nav row inside the App Shell example. Active state uses brand primary as the indicator.
- Properties: `backgroundColor`, `activeIndicator`, `rounded`, `padding`

**`ex-data-table-cell`** — Default data-table th + td chrome. Header uses mono-caps eyebrow typography; body uses body-sm.
- Properties: `headerBackground`, `headerTypography`, `bodyTypography`, `cellPadding`, `rowBorder`

**`ex-auth-form-card`** — Sign-in / sign-up card. Re-uses feature-card chrome with text-input primitives inside.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-modal-card`** — Modal dialog surface — same chrome as feature-card with elevated shadow.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-empty-state-card`** — Empty-state illustration frame.
- Properties: `backgroundColor`, `rounded`, `padding`, `captionTypography`

**`ex-toast`** — Toast notification surface — feature-card shape + medium shadow.
- Properties: `backgroundColor`, `rounded`, `padding`, `typography`


## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (`#171717`) for primary CTAs across the page. Black ink IS the conversion target.
- Use `{rounded.pill}` 100 px for every marketing-scale CTA and `{rounded.sm}` 6 px for nav-scale buttons. The two pill scales coexist deliberately.
- Set every headline in `{typography.display-*}` weight 600, sentence-case, often period-terminated. Aggressive negative tracking is part of the voice.
- Use the brand mesh gradient as atmospheric decoration at hero scale only — never miniaturise it to an icon, never reduce to a single colour.
- Layer stacked shadows (multiple small offsets with inset hairline) rather than single heavy drops. The brand's elevation is calmer than Material.
- Cycle page surfaces in `{colors.canvas-soft}` → `{colors.canvas}` → `{colors.primary}` polarity-flipped bands; the dark band IS the depth cue.
- Set every code block and technical eyebrow in `{typography.code}` / `{typography.caption-mono}`. Mono is the voice of the platform.

### Don't
- Don't introduce a sixth accent colour. The brand operates with ink + gray + the four-pair gradient palette; new accents flatten the voice.
- Don't render headlines in all-caps. Sentence-case + negative tracking is non-negotiable.
- Don't drop a single heavy drop-shadow on cards. The brand's elevation is built from stacked small offsets + inset hairline rings.
- Don't render the brand gradient at icon scale or in a single-colour reduced form. The gradient lives at hero scale only.
- Don't promote the geometric sans to weight 700. The brand's display ceiling is 600.
- Don't pair the marketing 100-px pill CTA shape with the 6-px nav radius on the same screen — pick a scale and stay there.
- Don't set body paragraphs in the mono face. The mono is for code + technical labels only.

## Решение владельца 2026-09-02 — акцент как главное действие, пилот

> DECISION. Переопределяет строку «везде ещё — чёрный/белый» из таблицы выше
> для экранов, переведённых на новый стандарт. Пилот — экран задания.

- Главное действие экрана — фирменный акцент `accent`, не чёрный `primary`.
  Вариант кнопки `accent` в `src/components/ui/Button.tsx`.
- Текст на акценте — токен `on-accent`. **Переопределено 2026-09-03: белый**
  (см. раздел ниже). Прежняя формулировка «тёмный в обеих темах» больше не
  действует.
- Информация на экране — читаемым `ink`, не `mute`; рядом микроиконка;
  секции с жирным заголовком, стопкой друг под другом. Образец — экран
  исполнителя Thumbtack (скриншот владельца).
- Главная: закреплённое поле поиска сверху, ряд чипов разделов (активный —
  в акценте), под ним строки категорий «плитка с иконкой + жирное название».
  Обложек-фото у категорий нет — плитка с иконкой на `accent-soft`, без
  подставных картинок.
- Нижнее меню — нативное (`NativeTabs` из expo-router): на iOS 26 это
  Liquid Glass, ниже — системная панель. Самописная панель убрана
  (`docs/IOS_FOUNDATION.md`: нативный механизм вместо своего).
- Если пилот принят владельцем — этот раздел становится стандартом для
  остальных экранов. До этого другие экраны не переводить.

## Решение владельца 2026-09-02 (вечер) — пилот принят, стандарт для всех экранов

> DECISION. Владелец посмотрел сборку 20 на устройстве: «шрифты слишком
> мелкие», «один общий стиль», «переделывать с нуля, а не подкрашивать».
> Ориентир — Thumbtack: карточка исполнителя, список, отзывы. Этот раздел
> действует для всех экранов; предыдущий раздел («пилот») в него входит.

### Карточка задания — одна на все ленты

- Каждое задание — **карточка** `rounded-2xl border-hairline bg-canvas p-4`,
  между карточками 12, от краёв экрана 16. Full-bleed строки с линией снизу
  (UI_PATTERNS §0, 2026-05-15) для лент заданий больше не применяются:
  у образца каждая сущность — отдельный объект, это читается с первого
  взгляда.
- Внутри стопкой: плитка категории 44 на `accent-soft` + категория 14 +
  время 14 mono → заголовок **18 bold** (2 строки) → описание 16 `body` →
  факты строками «иконка 18 в `ink` + текст 16 medium `ink`» (срок, место;
  «Срочно» — в `error`) → цена **18 bold** + «бюджет» 14 `mute`.
- Минимальный текст в карточке — **14 px**. 12 px в карточках не используется.
- Компонент — `src/components/OrderRow.tsx`; скелет повторяет форму.

### Шкала на экранах

| Назначение | Класс | Размер |
|---|---|---|
| Заголовок корня вкладки («Мои задания») | `text-display-lg` bold | 32 |
| Заголовок секции главной, пустого состояния | `text-display-sm` bold | 20 |
| Заголовок карточки, цена | `text-title-lg` bold | 18 |
| Строка списка категорий | `text-body-lg` semibold | 18 |
| Текст, факты, действия в шапке, сегменты | `text-body-md` | 16 |
| Категория, время, вторичные метки в карточке | `text-body-sm` / `text-mono-body` | 14 |

### Главное действие и формы

- Главное действие экрана — `Button variant="accent" size="lg"`: 52 pt,
  17 px semibold, текст `on-accent`. Второстепенное — `secondary`.
- Поле ввода — `Input`: заливка `canvas-soft`, рамка 1.5 `hairline-strong`,
  в фокусе рамка `accent`, `lg` = 54 pt / 17 px для auth-форм. Лейбл поля —
  16 semibold `ink`, ошибка — 14 `error`. Поле обязано читаться как поле.
- Ссылки-действия в формах («Забыли пароль?», «Зарегистрироваться») —
  16 semibold `accent`, тач-цель ≥ 44 pt. Подчёркивание не используется.
- Ошибка сервера — плашка `bg-error-soft` с текстом 16 `error-deep`.

### Главная

- Закреплённого поля поиска нет (удалено вместе с экраном `/search`, у
  которого не осталось ни одного входа). Фото-герой — от верха экрана.
- Секции: заголовок 20 bold, подзаголовок 16 `mute`; «Актуальные задания» —
  те же карточки, что и в «Найти задание».

## Решение владельца 2026-09-03 — белый контент на акценте, состояния загрузки

> DECISION по сборке 21 на устройстве. Переопределяет правило о тёмном тексте
> на акценте из раздела 2026-09-02.

### Контент на акцентной заливке — белый

- Токен `on-accent` = `#ffffff` в обеих темах. Действует везде, где фон
  акцентный: кнопка `Button variant="accent"`, круглая «+» на «Моих заданиях»,
  чип активного раздела, галочки в фильтрах и выборе категорий, выбранный день
  в календаре, кнопка «Откликнуться» в карточке.
- Акцент затемнён до `#e11d48` в **обеих** темах (DECISION владельца
  2026-09-03, второй заход). Белый на нём — 4.7:1, то есть AA для текста
  кнопки выполняется. Прежние `#fe5574` / `#ff6b87` давали с белым 3.1:1 и
  2.7:1.
- Компромисс назван честно: в тёмной теме тот же акцент КАК ТЕКСТ на canvas
  `#0a0a0a` даёт 4.2:1 вместо прежних 7.3:1. Цвета, проходящего AA сразу в
  двух ролях, не существует: заливка под белым требует яркости ≤0.183, текст
  на тёмном canvas — ≥0.189. Приоритет отдан кнопке.
- Известный след, не исправлено: моно-иконка категории (`accent`) на тёмном
  `accent-soft` `#4a1f29` даёт 2.9:1 при норме 3:1 для иконок. Лечится
  затемнением `accent-soft` в тёмной теме — отдельная задача.
- Розовый значок активной вкладки в нижнем меню — не заливка, его не трогаем.

### Ни один экран не остаётся в бесконечной загрузке

- У сетевых запросов есть таймаут (`src/lib/fetch-with-timeout.ts`). Без него
  молчащая сеть оставляла скелетон навсегда: промис не отклонялся, и
  react-query не переходил ни в ошибку, ни в повтор.
- Скелетон — не финальное состояние. После сбоя экран обязан показать текст и
  «Повторить». Текст берётся из `describeQueryError`: «Нет связи» для сбоя
  канала, «Не удалось загрузить» для сбоя сервиса. Техническую строку ошибки
  (`error.message`, «FetchError: …») пользователю не показываем.
- Транспортный сбой не повторяется автоматически (связи всё равно нет) —
  человек сразу видит понятный экран; ошибки сервера повторяются дважды.
- Каталог категорий имеет встроенную копию и показывается без сети. Разделы
  первого уровня копии не имеют: без них блок «Что нужно сделать» показывает
  категории общим списком, без ряда чипов, но не исчезает.

### Строка состояния на главной

Пока виден фото-герой, время и батарею защищает его собственный градиент. Как
только герой уходит вверх, включается непрозрачная полоса высотой safe-area
(`HomeStatusBarCover`, токен `canvas`, обе темы), иначе контент наезжает на
системные индикаторы.

### Первый шаг создания задания

- Пустого экрана с лупой быть не должно. До ввода видно: «Недавние» (свои
  подтверждённые формулировки этого устройства) и «Категории» (первые 8 из
  каталога) плюс «Все категории».
- Поиск показывает совпадение, даже если оно найдено по опечатке
  (совпадения по триграммам) — раньше такие результаты отбрасывались, и экран
  говорил «точной подсказки не нашли». Категория по-прежнему не назначается
  сама: нужен явный тап.
- Карточка задания различает категории цветной иконкой каталога (запасной
  вариант — монохромная), иначе лента выглядит однообразной.

## Решение владельца 2026-09-04 — карточка должна быть видна

> DECISION по скриншоту сборки 23 рядом с референсом: «карточка обведена, но
> линия обводки не видна; у референса тень, шрифты и иконки сбалансированнее».

Причина была не в толщине рамки. Карточка стояла белым (`canvas`) на белом
(`canvas`), и весь край держался на линии `hairline` `#ebebeb` — контраст 8%,
на телефоне при свете он исчезает.

### Две поверхности вместо одной

- `surface-page` — фон списка: `#fafafa` в светлой теме, `#0a0a0a` в тёмной.
- `surface-card` — карточка: `#ffffff` в светлой, `#161616` в тёмной.

В тёмной теме пара инвертирована: приподнятая поверхность светлее фона, а не
темнее. Одним токеном это не выражается, поэтому их два.

### Тень обозначает край, а не рисует объём

`shadowOpacity 0.05`, радиус 8, смещение 2 вниз. Этого достаточно, чтобы край
читался; большего система не разрешает — глубина у нас не декоративная
(design-quality §1.1).

Применяется к карточкам списков: задание, специалист, скелетоны, пустые
состояния. Экраны со списками получают фон `surface-page`.

### Внутренних разделителей в карточке нет

Линия перед ценой убрана: у карточки уже есть край, вторая черта внутри
делила её на две половины и спорила с ним.

## Решение владельца 2026-09-04 (вечер) — поля Apple, карточки с нуля, Liquid Glass

> DECISION по скриншотам сборки 26. Пять претензий подряд: кривой текст в
> поиске, тяжёлая карточка задания, ненужный блок категорий, скучный баннер и
> «ужасный» экран категории. Плюс общее указание: «пускай будет iOS Liquid
> Glass Design, возьми оттуда базу».

### Поле ввода — правила Apple, а не наши привычки

Разбор дал одну общую причину «кривого» текста во всём приложении: полю
задавали класс типографики, а в нём есть `lineHeight`. На iOS `lineHeight` у
`TextInput` попадает в `paragraphStyle.maximumLineHeight` — весь запас высоты
уходит **над** строкой, и текст встаёт ниже центра поля
(facebook/react-native#39145, #28012, #33986).

- Новый токен шрифта `field-*` — **только размер, без `lineHeight`**. Он
  обязателен для однострочного поля. Многострочному `lineHeight` нужен, там
  остаётся `body-*`.
- `Input` задаёт `lineHeight` только на web, включает системную кнопку очистки
  и тёмную клавиатуру в тёмной теме.
- `SearchField` — единственный вид поиска в приложении. По HIG «Search fields»:
  лупа слева говорит о назначении, кнопка очистки **системная**, «Отмена»
  прекращает поиск и убирает клавиатуру, клавиша Return — «Поиск», подсказка
  объясняет что искать, высота 48 (тач-цель 44 pt; было 40).
- Контракт закреплён тестом `src/components/ui/text-field-contract.test.ts`:
  однострочному `TextInput` нельзя вернуть класс с `lineHeight`.

### Карточка держится на типографике

Общий язык карточек (задание, специалист) после разбора референса Thumbtack:

- иконка живёт **в строке текста, в размер текста, без подложки**. Плитка
  44×44 под иконку категории убрана — она весила больше, чем сама категория;
- факты — **одна строка через «·»**, а не стопка рядов «иконка + слово»;
- число, ради которого карточку смотрят (цена, рейтинг), набрано крупно и
  стоит отдельно;
- ничего мельче 14 px. Мета в 12 px из старых карточек убрана;
- то, что относится не к предмету карточки, а к действию над ним (отклики),
  уходит в подвал за линию.

### Liquid Glass — только там, где под панелью что-то едет

Материал iOS 26 преломляет то, что под ним. Значит он уместен ровно в
закреплённых панелях, под которыми проезжает содержимое: шапка экрана
категории, панель поиска на вкладке «Специалисты», системное нижнее меню.

- Компонент — `src/components/ui/GlassSurface.tsx`. Если Liquid Glass
  недоступен (iOS до 26, web), возвращается обычная поверхность с волосяной
  границей: экран остаётся правильным, а не «сломанным без стекла».
- **Стекло не кладётся на стекло.** Кнопки и чипы внутри стеклянной панели —
  обычные, с заливкой.
- Карточки в ленте стеклом не заливаются: под ними ничего не движется.

### Экран категории — по правилам системного большого заголовка

- Крупное название категории живёт в содержимом и уезжает вверх; в этот же
  момент в закреплённой строке проявляется то же название мелким кеглем.
- Прятанье шапки при прокрутке убрано: оно уносило вместе с собой фильтры —
  единственное управление на экране.
- Кнопка «назад» — тонкая угловая скобка в круге 44×44 вместо залитого
  треугольника в 28 px.
- Слово «мастер» из интерфейса убрано: вкладка называется «Специалисты», и
  экран обязан говорить так же (`specialistsLabel`).
- Пустой экран отвечает, **что именно** пусто — категория или выбранный
  фильтр, — и даёт выход: сбросить фильтры либо описать задачу.

### Реклама называется рекламой

Блок «Специально для вас» переименован в «Реклама», и метка «Реклама» стоит на
самом баннере. Подбора нет — обещать его нельзя (design-quality §5). Баннер
бывает фотографией рекламодателя или рисуется приложением, когда живого
рекламодателя нет. Чужие товарные знаки в баннер не ставятся.
