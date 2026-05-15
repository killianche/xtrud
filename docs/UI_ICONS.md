# UI-иконки (Phosphor)

**Имя для запроса:** «UI иконки», «Phosphor», «иконки кнопок / навигации / статусов», «icon set приложения».

## TL;DR

Все UI-иконки приложения (TabBar, ScreenHeader back-кнопка, кнопки действий, status-индикаторы, ListItem chevrons, формы) — **Phosphor React Native**. Один источник истины: пакет [`phosphor-react-native`](https://github.com/duongdev/phosphor-react-native) (NPM, ~1.4k иконок, 6 weights). Активирован 2026-05-15 (TabBar) как замена Lucide. Lucide остаётся в legacy-коде до постепенной миграции — НЕ ставить Lucide в **новый** код.

> Этот документ — про **моно-UI-иконки** (System / UI / Action). Цветные иконки **категорий услуг** (L2) — отдельный документ [`docs/ICONS.md`](ICONS.md), они через Iconify CDN и не пересекаются с Phosphor.

## Почему Phosphor, а не Lucide

| Критерий | Lucide (Feather-стиль) | Phosphor (выбран) |
|---|---|---|
| Weights | 1 (только outline) | **6**: thin / light / regular / bold / fill / duotone |
| Active-state | `strokeWidth: 1.5 → 2.25` (слабая разница) | `weight: "bold" → "fill"` — **залитая фигура** vs outline |
| Стиль | тонкие линии, утилитарный | fluid corners, geometric, premium |
| Используют | Vercel-веб (CSS-иконки), shadcn/ui | Linear, Arc, Mercury, Cron, новые modern apps 2024-26 |
| API в RN | `<Home size strokeWidth color/>` | `<House size weight color/>` — почти идентичен |

Phosphor даёт **мгновенно читаемую** active/inactive разницу (filled vs outline), что критично для bottom-tab navigation и не работало с Lucide.

## Когда использовать

- **Всегда**, если иконка моно (одноцветная), системная, или для UI-действия.
- TabBar, ScreenHeader (back, right-action), Button с иконкой, Chip, ListItem chevron, form-fields suffix-иконки, status-индикаторы (CheckCircle, WarningCircle, Info).

## Когда НЕ использовать

- **Категории услуг (L2)** — там цветные SVG через Iconify CDN ([`docs/ICONS.md`](ICONS.md)). Phosphor — моно, не подходит для tile-категорий.
- **Декоративные/hero-блоки** — там либо иллюстрация (Open Doodles, [`docs/ILLUSTRATIONS.md`](ILLUSTRATIONS.md) если есть), либо tinted-Lucide-fallback в `FeaturedRequests` (исторически).
- **Аватары** — DiceBear `shapes`, см. `CLAUDE.md` § «АВАТАРЫ — ТОЛЬКО DiceBear shapes».
- **Эмодзи как иконки** — запрещено в UI, см. `CLAUDE.md`.

## Установка

```bash
npm install phosphor-react-native
```

Зависит от `react-native-svg` (уже стоит в проекте, 15.12.1).

## API

```tsx
import { House, ChatCircle, UserCircle, MagnifyingGlass } from "phosphor-react-native";

<House size={26} weight="bold" color={tc.ink} />
<House size={26} weight="fill" color={tc.ink} />   // active state
```

Props:
- `size: number` — пиксели, не «sm/md/lg».
- `weight: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"` — толщина / стиль.
- `color: string` — hex / rgb / `currentColor` для web. На web передавать `"currentColor"` и подложить parent с CSS-class (`text-ink`/`text-mute`), чтобы CSS-var из NativeWind резолвилось через тему. На native — hex напрямую из `useThemeColors`.
- `mirrored?: boolean` — для RTL.

## Какой weight использовать (правило)

| Контекст | Inactive | Active / Selected | Notes |
|---|---|---|---|
| **TabBar** | `bold` | `fill` | стандарт «filled-when-active», как Instagram / Threads / X |
| **ScreenHeader back-кнопка** | `bold` | — | back всегда bold (нет active state) |
| **Кнопка с иконкой** (Button leading-icon) | `bold` | `bold` (или `fill` если кнопка primary/selected) | weight совпадает с button-variant |
| **Chip leading-icon** | `bold` | `fill` (когда chip selected) | Например, в LocationSheet «Вся Ингушетия» |
| **ListItem chevron** | `regular` или `bold` | — | `CaretRight` для navigation rows |
| **Status icon** (CheckCircle, WarningCircle, Info) | `fill` | — | всегда filled — статус не имеет outline-семантики |
| **Form-field suffix** | `bold` | — | иконка очистки `X` / показать пароль `Eye` |

**Размеры (стандарт):**
- 18-20: inline в тексте (BodyText с leading-icon)
- 22-24: form-fields, chip, ListItem chevron
- **26**: TabBar (текущий стандарт)
- 28: ScreenHeader back-кнопка
- 32-40: empty-state hero иконка, кнопка primary с большой иконкой

## Pill-подложка под активной иконкой (TabBar / nav)

Active state в TabBar = `weight="fill"` + ink color + **pill-фон** `bg-canvas-soft-2` (paddingHorizontal 14, paddingVertical 4, borderRadius 999). Даёт chip-style focus indicator как в Material 3 / Apple Music. См. реализацию в [`src/components/TabBar.tsx`](../src/components/TabBar.tsx).

## Маппинг Lucide → Phosphor (наиболее частые)

Если рефакторишь legacy-код или сомневаешься в имени — таблица:

| Lucide | Phosphor | Notes |
|---|---|---|
| `Home` | `House` | без двери, чище |
| `Search` | `MagnifyingGlass` | без «штриха через» |
| `User` | `UserCircle` (или `User`) | `UserCircle` для navigation, `User` плоский для inline |
| `MessageCircle` | `ChatCircle` | без хвостика-tail |
| `MessageSquare` | `ChatTeardrop` или `ChatCircle` | |
| `ClipboardList` | `ClipboardText` | |
| `CirclePlus` / `PlusCircle` | `PlusCircle` | имя то же |
| `ChevronLeft` / `Right` / `Down` | `CaretLeft` / `Right` / `Down` | Phosphor называет «caret», не «chevron» |
| `X` | `X` | |
| `Check` | `Check` | |
| `CheckCircle` | `CheckCircle` | используем `weight="fill"` для success-status |
| `AlertCircle` | `WarningCircle` | |
| `Info` | `Info` | |
| `Bell` | `Bell` (или `BellSimple`) | |
| `Settings` | `Gear` (или `GearSix`) | |
| `Heart` | `Heart` | |
| `Star` | `Star` | для рейтинга используем `weight="fill"` |
| `Phone` | `Phone` | |
| `Mail` | `Envelope` | |
| `MapPin` | `MapPin` | |
| `Camera` | `Camera` | |
| `Image` | `Image` | |
| `Trash2` / `Trash` | `Trash` | |
| `Pencil` / `Edit` | `Pencil` или `PencilSimple` | |
| `Lock` | `Lock` | |
| `Eye` / `EyeOff` | `Eye` / `EyeSlash` | |
| `Filter` | `FunnelSimple` (или `Funnel`) | |
| `ArrowRight` / `Left` | `ArrowRight` / `Left` | |
| `Share2` | `Share` или `ShareNetwork` | |
| `Building` / `Building2` | `Buildings` | |
| `Users` (group) | `Users` или `UsersThree` | |

Полный каталог: **https://phosphoricons.com** — кликни иконку, переключи weight, скопируй имя. Имена в `phosphor-react-native` PascalCase (как в каталоге, но без пробелов).

## Где сейчас используется

- [`src/components/TabBar.tsx`](../src/components/TabBar.tsx) — центральная и right-таб иконки (MagnifyingGlass, PlusCircle).
- [`app/(tabs)/_layout.tsx`](../app/(tabs)/_layout.tsx) — 4 tabBarIcon (House, ClipboardText, ChatCircle, UserCircle).

**Постепенная миграция Lucide → Phosphor:** оставшиеся ~80-120 мест с Lucide мигрируем по мере правки экранов (по фичам, не отдельным sweep'ом). При любой правке UI-кода — если уже трогаешь файл, заменяй Lucide imports на Phosphor по таблице выше.

## Anti-patterns

- ❌ **Mixing Lucide + Phosphor в одном экране** — стилистический разнобой (Lucide тонкий, Phosphor чуть плотнее). Если на экране уже Phosphor — все иконки этого экрана должны быть Phosphor.
- ❌ **`weight="thin"` или `"light"`** в production UI — слишком тонкие, не читаются на mobile. Использовать только в hero-decoration на 64+ px.
- ❌ **Active state через изменение `weight` от `regular` → `bold`** (как Lucide через strokeWidth) — слабая разница. Используй `bold` → `fill`, разница ощутимая.
- ❌ **`size: 16` или меньше** — touch-target слишком мал, иконка теряется. Минимум 18 inline, 22 в кнопке.
- ❌ **Цвет hex inline (`color="#000"`)** — не работает в dark mode. Используй `tc.ink` / `tc.mute` через `useThemeColors`, или `color="currentColor"` на web с tailwind-class на parent.

## История решений

- **2026-05-15** — введён Phosphor как UI icon set по умолчанию. Триггер: user-фидбэк «иконки внизу обычные, хочу ультрасовременные дизайнерские». Lucide остаётся в legacy-коде, мигрируется по мере правки. TabBar — первый экран на Phosphor с pattern «bold → fill» + pill-подложка.
