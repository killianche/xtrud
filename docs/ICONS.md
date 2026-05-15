# Иконки категорий (ICONS.md)

**Имя для запроса:** «цветные иконки категорий», «category color icons», «брендовые иконки».

## TL;DR

Одна функция — один источник истины для цветных SVG-иконок категорий L2 по всему сайту: `getCategoryColorIconUrl(l2Id)` в [`src/lib/category-color-icons.ts`](../src/lib/category-color-icons.ts). Возвращает URL цветной SVG из [Iconify CDN](https://api.iconify.design) — `twemoji` (плоские цветные эмодзи Twitter) и `fluent-color` (Microsoft Fluent 2D). Если категории нет в маппинге — возвращает `null` (caller использует моно-Lucide-fallback).

## Когда использовать

Везде, где отображается **L2-категория услуг**: каталог, карточки заказов, master detail, фильтры, wizard'ы. Цветная иконка даёт мгновенную узнаваемость без переусложнения дизайна.

## Когда НЕ использовать

- **L3-услуги** (вложенные в L2). Используем иконку родительской L2 — для 290+ L3 свой маппинг не имеет смысла, визуальная связь и так читается.
- **Featured-hero блоки** на главной (`FeaturedRequests`) — там декоративная композиция с tinted-фоном и крупной центральной иконкой, специально на Lucide. См. `app/(tabs)/index.tsx`.
- **TabBar / системные UI-элементы** — там моно-Lucide по дизайн-системе.

## API

```ts
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";

const url = getCategoryColorIconUrl("plumbing");
// → "https://api.iconify.design/twemoji/droplet.svg"

// Если категория не в ICON_MAP:
const url2 = getCategoryColorIconUrl("unknown-l2");
// → null
```

Рендеринг в JSX:

```tsx
const colorUrl = getCategoryColorIconUrl(cat.id);
// ...
<View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft">
  {colorUrl ? (
    <Image source={{ uri: colorUrl }} style={{ width: 24, height: 24 }} />
  ) : (
    // Lucide-fallback (моно)
    <Icon size={20} strokeWidth={1.5} color="currentColor" />
  )}
</View>
```

## Текущий маппинг

Источник истины — константа `ICON_MAP` в [`src/lib/category-color-icons.ts`](../src/lib/category-color-icons.ts). Состояние на 2026-05-15:

| L2 id | Iconify-имя | Логика выбора |
|---|---|---|
| `plumbing` | `twemoji/droplet` | капля воды |
| `electrical` | `fluent-color/lightbulb-24` | лампочка |
| `renovation` | `fluent-color/wrench-screwdriver-24` | инструмент ремонта |
| `handyman` | `fluent-color/wrench-24` | гаечный ключ |
| `cleaning-post-renovation` | `twemoji/sparkles` | блёстки/чистота |
| `windows` | `twemoji/window` | окно |
| `doors` | `twemoji/door` | дверь |
| `locks-security` | `fluent-color/lock-shield-24` | замок + щит |
| `painting` | `fluent-color/paint-brush-24` | кисть |
| `drywall` | `twemoji/paintbrush` | штукатурка / нанесение |
| `tiling` | `twemoji/chequered-flag` | клетчатая сетка плитки |
| `floors` | `twemoji/black-square-button` | паркет / квадрат |
| `ceilings` | `twemoji/light-bulb` | потолок-лампа |
| `tension-ceilings` | `twemoji/film-frames` | натянутая плёнка |
| `climate` | `fluent-color/weather-snowflake-24` | кондиционер |
| `insulation` | `twemoji/scarf` | тепло-изоляция |
| `roofing` | `twemoji/house` | дом / кровля |
| `facade` | `fluent-color/building-24` | здание |
| `concrete` | `twemoji/construction-worker` | бетонщик |
| `masonry` | `twemoji/hammer-and-pick` | кладка камня |
| `welding` | `twemoji/fire` | искра / огонь |
| `general-construction` | `twemoji/construction` | стройка |
| `drilling-wells` | `twemoji/potable-water` | скважина |
| `fences-gates` | `twemoji/japanese-castle` | забор |
| `landscape` | `twemoji/deciduous-tree` | дерево |
| `baths-pools` | `twemoji/hot-springs` | баня |
| `furniture` | `twemoji/couch-and-lamp` | мебель |
| `curtains-blinds` | `twemoji/framed-picture` | шторы / рама |
| `interior-design` | `twemoji/straight-ruler` | линейка дизайнера |
| `demolition` | `twemoji/hammer` | молоток |
| `movers` | `twemoji/delivery-truck` | грузовик |
| `appliance-repair` | `twemoji/electric-plug` | техника |
| `satellite-tv` | `twemoji/satellite-antenna` | антенна |
| `security-systems` | `twemoji/camera` | камера |

**Категории БЕЗ цветной иконки** (показывают Lucide-fallback): новые L2 после расширения таксономии. Когда добавляешь новую L2 в БД — добавь и в `ICON_MAP`.

## Где сейчас используется

- [`app/(tabs)/index.tsx`](../app/(tabs)/index.tsx) — секция «Все мастера» (полный список L2 с цветными иконками)
- [`app/(tabs)/category/[id].tsx`](../app/(tabs)/category/[id].tsx) — PickerSheet с L3-услугами (иконка родительской L2)
- [`app/(tabs)/master/[id].tsx`](../app/(tabs)/master/[id].tsx) — секция «Услуги» в карточках категорий мастера
- [`app/(tabs)/orders/category-select.tsx`](../app/(tabs)/orders/category-select.tsx) — wizard выбора категории при создании заказа
- [`src/components/OrderRow.tsx`](../src/components/OrderRow.tsx) — карточка заказа в списках (orders/index, chats)

## Правила добавления новой категории

1. Добавь L2-id в `ICON_MAP` (src/lib/category-color-icons.ts)
2. Выбирай иконку из:
   - **`twemoji/<name>`** — для физических объектов / эмоций / природы (плоский цветной стиль Twitter)
   - **`fluent-color/<name>-24`** — для инструментов / абстракций / технологий (Microsoft Fluent 2D)
3. Размер задаём в caller'е (обычно `24×24` в `h-10 w-10` контейнере, `20×20` в `h-8 w-8`)
4. Обнови таблицу в этом файле
5. Никаких эмодзи в JSX как замена иконкам (см. `CLAUDE.md` § «НИКАКИХ ЭМОДЖИ В UI БЕЗ ЯВНОГО РАЗРЕШЕНИЯ»). Эмодзи можно только в текстовом контенте; иконки — через Iconify CDN или Lucide.

## Не делать

- ❌ Inline-эмодзи `🔧 💧` в UI вместо Iconify
- ❌ DiceBear `glass`/`shapes` как иконки категорий — это для аватаров и абстрактных декоров, не для семантики
- ❌ Lucide-only (без цветной альтернативы) на витринах — выглядит слишком монохромно для marketplace
- ❌ Картинки в репо (`assets/icons/*.svg`) — Iconify CDN покрывает 200k+ иконок, локальные SVG нужны только для бренд-марок (логотип, watermark)

## История решений

- **2026-05-14** — введено `getCategoryColorIconUrl` (Iconify-вариант) как замена сплошной Lucide-моно витрины. Каталог категорий стал визуально живой без переусложнения.
- **2026-05-15** — распространено на master detail (категории «Услуги»), category-select wizard. Запрет на DiceBear-glass как category-icon (это для шапок-аватаров, не для семантики L2).
