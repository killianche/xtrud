# Location system — design doc

> Активно с 2026-05-14. Полная переработка по образцу проекта **Ingush-Business** (см. их `lib/config.ts` + `CityContext` + 3 sheet'а). Не путать `orders.city_id` / `orders.district` (локация заказа) с `users.city_id` (город пользователя для рекомендаций) — это отдельные семантики, см. § «Три семантики локации».

---

## TL;DR

Единый источник истины [`src/lib/location-config.ts`](../src/lib/location-config.ts) с 8 поселениями (5 cities + 3 крупных села как top-level), 4 муниципальными районами, 32+ сёлами, координатами для Haversine, helpers и Set-API. Глобальное состояние пользовательского города — [`useUserCity`](../src/lib/use-user-city.ts) с init-циклом AsyncStorage → geolocation → ближайший → DEFAULT_CITY. Три bottom-sheet компонента под разные UX-задачи:

- **`<LocationPicker>`** — иерархический single-select для заказа (Вся-Ингушетия / Город / Район → Село). `src/features/orders/LocationPicker.tsx`.
- **`<LocationSheet>`** — multi-select городов+районов через `LocationFilter` `{isAll, cities[], districts[]}`. `src/components/ui/LocationSheet.tsx`.
- **`<LocationFilterSheet>`** — multi-select городов+сёл напрямую через `Set<"c:cityId"|"v:village">`. `src/components/ui/LocationFilterSheet.tsx`.

**Когда использовать:** в любом экране, где клиент / мастер указывает географическое местоположение для заказа или работы. Сейчас — `orders/new` и `orders/edit/[id]` через `<LocationPicker>` в `OrderFormBody`. LocationSheet / LocationFilterSheet готовы к использованию в фильтрах master feed, master service zone, search results — см. follow-up в TASKS.md.

---

## Уровни иерархии

```
Вся Ингушетия (опц., =city_id NULL — заказ виден всем мастерам РИ)
│
├── Магас                  ─┐
├── Назрань                 │
├── Сунжа                   │
├── Малгобек                │  8 поселений в supabase.cities (text id, миграции 0001 + 0050).
├── Карабулак               │  Координаты для Haversine — в CITY_COORDINATES.
├── Орджоникидзевская       │
├── Серноводская            │
└── Нестеровская           ─┘
│
└── 4 муниципальных района (hardcoded DISTRICTS в location-config.ts):
    ├── Назрановский район → 10 сёл (Экажево, Яндаре, Плиево, Сурхахи, …, Али-Юрт)
    ├── Сунженский район   → 6 сёл  (Алхасты, Аршты, Берд-Юрт, Галашки, Даттых, Чемульга)
    ├── Малгобекский район → 8 сёл  (Зязиков-Юрт, Инарки, Сагопши, Пседах, …)
    └── Джейрахский район  → 8 сёл  (Джейрах, Ляжги, Армхи, Ольгети, …)
```

**Итого:** 8 cities в БД + 4 районов + 32 села. Все списки — в [`src/lib/location-config.ts`](../src/lib/location-config.ts). `FILTER_VILLAGES` — плоский отсортированный список всех сёл для Set-фильтра.

**Заметка:** Орджоникидзевская / Серноводская / Нестеровская раньше жили как сёла Сунженского района, после миграции `0050_cities_add_large_villages.sql` (2026-05-14) перевели в top-level cities — по факту это городские центры с населением > 15K (Орджоникидзевская ~60K).

---

## Хранение в БД

### orders таблица (миграция 0049)

| Колонка | Тип | Семантика |
|---|---|---|
| `city_id` | `text NULL` REFERENCES `cities(id)` | id города из 5; **NULL** для «Вся Ингушетия» |
| `district` | `text NULL` (max 60 chars) | имя района ИЛИ имя села — финальный текст |

**Семантика `district`:**

- `null` или `""` — район не выбран.
- `"Назрановский район"` — выбран район, конкретное село не указано.
- `"Экажево"` — выбрано конкретное село. Родительский район восстанавливается клиент-сайд через `findDistrictByVillage("Экажево") === "Назрановский район"`.

Так что `district` — это **finest level селектор**, без иерархии в самой БД. Иерархия видна только в UI через lookup в const.

### Семантика `city_id = NULL`

После миграции `0049_orders_city_optional.sql` (`ALTER TABLE orders ALTER COLUMN city_id DROP NOT NULL`) — `city_id` может быть NULL. Это означает «Вся Ингушетия» — заказ не привязан к конкретному городу, мастера из любого города в РИ его видят.

**Конвертация в UI:**

```ts
// Form-state имеет cityId="all" (UI-значение).
// useCreateOrder: "all" → null в БД payload
city_id: input.cityId === ALL_INGUSHETIA_CITY ? null : input.cityId
// orders/edit reset: null → "all" обратно в form-state
cityId: order.city_id ?? "all"
```

### Регенерация типов

После миграции 0049 обязательно регенерировать `src/types/database.ts`:

```bash
# Через Supabase MCP (предпочтительно)
mcp__60860ed0-af83-4b0e-869b-1e21dbf91dac__generate_typescript_types

# Или CLI
npx supabase gen types typescript --project-id wgeimsajvjkzrrnfrnkb > src/types/database.ts
```

`orders.city_id` в Row/Insert/Update теперь `string | null`.

---

## Компонент

[`src/features/orders/LocationPicker.tsx`](../src/features/orders/LocationPicker.tsx) — ~270 строк. Архитектура:

```
<LocationPicker
  cityId={value}        // "" | "all" | city.id
  district={value}      // "" | "Назрановский район" | "Экажево" | ...
  cities={data}         // from useCities()
  onChange={({cityId, district}) => ...}
  disabled={isBusy}
  error={errors.cityId?.message ?? errors.district?.message}
/>
```

**Внутренняя структура:**

1. **Trigger** — pill-row 48px высоты, выглядит как form-input. MapPin-иконка слева + composed-label (`"Магас · Экажево"` / `"Вся Ингушетия"` / placeholder).
2. **BottomSheet** (`fullScreen=true`) — рендерит контент через RN `Modal` с `animationType="slide"`. Drag-handle сверху, title-row, X-кнопка справа от title.
3. **Toggle «Вся Ингушетия»** — выделенная card с MapPin-кружком и subtitle «Заказ увидят мастера со всей республики».
4. **Раздел «Город»** — 5 chips. Выбор города **снимает** «Вся Ингушетия» toggle.
5. **Раздел «Район (необязательно)»** — 4 chips. Виден только когда город выбран (не «Вся Ингушетия»). Повторный тап на selected = снять выбор.
6. **Sub-row «Уточнить село»** — появляется при выборе района. Меньше chips (h-8, text-caption, px-3) — визуальная иерархия sub-level. Тап на село меняет `district` с имени района на имя села. Повторный тап = вернуться к district = имя района.
7. **Sticky bottom CTA «Готово»** — primary pill h-14. Commit `onChange({cityId, district})` + закрытие sheet'а.

**Draft-state:**

Изменения внутри sheet'а копятся в локальном state (`draftCity`, `draftDistrict`), коммитятся ТОЛЬКО при тапе «Готово». Back / X / backdrop-tap = отмена изменений. При следующем открытии sheet'а draft синхронизируется с актуальными props через `useEffect`.

**Pre-fill / edit заказа:**

`findDistrictByVillage(district)` восстанавливает родительский район по имени села. Оба chip'а (район + село) подсвечены чёрными pills в UI. Если `district` = имя района, `isDistrict(district) === true` и sub-row показывает villages без selected.

---

## Reference

Подход скопирован из соседнего проекта **Ingush-Business** (см. их `components/LocationSheet.tsx`):

- `DISTRICTS[district].villages` структура — взята 1:1 (адаптированы list'ы под наши известные сёла РИ)
- 4 муниципальных района РИ — те же
- Bottom-sheet pattern — тот же (Modal slide-up + sticky CTA)

**Отличия от Ingush-Business:**

- У них 8 cities (Назрань, Магас, Карабулак, Малгобек, Сунжа + Орджоникидзевская, Нестеровская, Серноводская). У нас 5 — последние 3 у нас живут как villages Сунженского района (единый источник истины: либо city, либо village, не оба).
- У них multi-select через `Set<string>` с префиксами `c:Назрань` / `v:Экажево`. У нас single-select для заказа (один заказ = одна локация).
- У них `LocationFilterSheet` для вакансий с режимами `cities` / `villages-open` / `village-chosen`. У нас единый sheet всё на одном экране.
- У них long-press на city → исключить из рекомендаций (`trackEvent({eventType: 'city_exclude'})`). У нас этого нет — для заказа не нужно.

---

## Три семантики локации в xtrud

| Уровень | Где хранится | Кто меняет | Назначение |
|---|---|---|---|
| **Локация заказа** | `orders.city_id` + `orders.district` | Клиент через `LocationPicker` | Где выполнить работу — мастер видит при поиске |
| **Город пользователя** | `users.city_id` (nullable) | Пользователь через `CitySelector` / профиль | Фильтр главной / каталога / рекомендаций |
| **Город организации** | `users.city_id` (для мастера) | Мастер при онбординге | Откуда мастер работает |

**Не путать.** `LocationPicker` — только для заказа. Для пользовательских настроек — `<CitySelector>` (chip + `PickerSheet` со списком городов). Для мастер-онбординга — простой `<CityPicker>` в [`master-profile.tsx`](../app/(onboarding)/master-profile.tsx).

---

## Компоненты — обзор

### `<CitySelector>` — chip + PickerSheet с одним городом
[`src/components/CitySelector.tsx`](../src/components/CitySelector.tsx)

Trigger «📍 Магас ▾» на главной. Single-select: «Вся Ингушетия» + 8 cities. Использует `useUserCity` глобальный store.

### `<LocationPicker>` — иерархический picker для заказа
[`src/features/orders/LocationPicker.tsx`](../src/features/orders/LocationPicker.tsx)

Trigger «📍 Магас · Экажево» в форме заказа. Bottom-sheet с 4 уровнями (Вся-Ингушетия / 8 городов / 4 района → села выбранного района). Single-select. Draft-state + commit-on-«Готово». Pre-fill через `findDistrictByVillage`.

### `<LocationSheet>` — multi-select городов+районов
[`src/components/ui/LocationSheet.tsx`](../src/components/ui/LocationSheet.tsx)

Bottom-sheet для multi-select. State — `LocationFilter` `{isAll, cities[], districts[]}`. Toggle «Вся Ингушетия» снимает остальные. `getLocationLabel(filter)` даёт строку для trigger pill («Назрань, Магас» / «Назрань +2 / 1 р-н»). Для фильтров master feed / master service zone (после переключения в multi-mode).

### `<LocationFilterSheet>` — Set-API с сёлами
[`src/components/ui/LocationFilterSheet.tsx`](../src/components/ui/LocationFilterSheet.tsx)

Multi-select с сёлами **напрямую** через `Set<"c:cityId"|"v:village">` префиксы. Два режима UI: `"cities"` (главная) и `"villages"` (поиск по 32 сёлам). Для случаев когда нужно выбрать конкретные сёла, не выбирая весь район.

### `useUserCity()` — глобальный hook
[`src/lib/use-user-city.ts`](../src/lib/use-user-city.ts)

Zustand store + persist (`xtrud-city` ключ, version 3). Init-цикл:
1. Читать из AsyncStorage (мгновенно).
2. Если `isUserChoice === false` (нет явного выбора) — попытаться geolocation.
3. На web — `navigator.geolocation.getCurrentPosition()` (timeout 5s).
4. На native — пока no-op (TODO: установить `expo-location`).
5. `getNearestCity(lat, lng)` — Haversine, threshold 30км.
6. Fallback → `DEFAULT_CITY_ID = "nazran"`.

Возвращает `{cityId, cityName, setCity, isInitialized, isUserChoice}`.

---

## Расширение системы (follow-up tasks)

Зафиксированы в [TASKS.md](../TASKS.md):

1. **Миграция БД `locations`** — таблица `locations(id, name, type='city'|'village', parent_district, lat, lng)` + admin UI добавления / правок. Заменит hardcoded `DISTRICTS` const на запросы из БД. Позволит admin'у добавлять новые сёла без code-deploy.
2. **LocationPicker в master profile** — расширить мастера от city до района/села (`master_profiles.district` + `master_profiles.village`).
3. **LocationFilterSheet для master service zone** — мастер указывает «работаю в N городах/сёлах». БД-таблица `master_service_zones(master_id, location_id_with_prefix)`. Компонент готов, нужна интеграция в master profile edit.
4. **LocationSheet для master feed фильтра (мастер)** — мастер фильтрует входящие заказы по нескольким городам/районам.
5. **native geolocation через `expo-location`** — заменить заглушку в `getDeviceCoordinates` для native. См. inline-TODO в `use-user-city.ts`.

---

## История ключевых решений (даты)

- **2026-05-14 (часть 1)** — создан `<LocationPicker>` как замена двух плоских chip-row секций в `orders/new`. Подход скопирован из Ingush-Business. Миграция `0049_orders_city_optional.sql` позволила `city_id = NULL` для «Вся Ингушетия».
- **2026-05-14 (часть 2)** — **полная архитектурная переработка** по образцу Ingush-Business. Создан единый `src/lib/location-config.ts` (MAJOR_CITIES + CITY_COORDINATES + DEFAULT_CITY_ID + DISTRICTS + FILTER_VILLAGES + LocationFilter + LocSet + getNearestCity Haversine + getLocationLabel + helpers). Миграция `0050_cities_add_large_villages.sql` добавила 3 cities (Орджоникидзевская, Серноводская, Нестеровская). Создан `useUserCity` hook с init-циклом AsyncStorage → geo → nearest → default. Добавлены 2 новых компонента: `<LocationSheet>` (multi-select городов+районов) и `<LocationFilterSheet>` (Set-API с сёлами). CitySelector переведён на новый `useUserCity`. Все константы локации переведены в `location-config.ts` — `order-schema.ts` остался только с Zod-схемами и re-export'ами для обратной совместимости.
- **(до)** `cities` таблица существует с Sprint 1 (миграция 0001), 5 городов. CityId — text PK.
