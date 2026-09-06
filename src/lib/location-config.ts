/**
 * Единый источник истины для локационных данных РИ — города, районы, сёла,
 * координаты, fallback'ы. Подход скопирован из проекта Ingush-Business
 * (`lib/config.ts`). Используется везде где упоминается локация:
 *   - <CitySelector>  — выбор города пользователя (главная)
 *   - шаг «Где» конструктора задания (app/(details)/orders/new/where.tsx)
 *   - фильтры ленты по городам и районам
 *   - Set<"c:"|"v:"> фильтр с сёлами
 *   - useUserCity     — глобальное состояние + init цикл
 *
 * НЕ дублировать константы в самих компонентах — импортировать отсюда.
 * (Anti-pattern Ingush-Business: LocationSheet.tsx переопределял свой CITIES.
 *  У нас единый источник.)
 *
 * Расширение списков:
 *   - Новый город → MAJOR_CITIES + CITY_COORDINATES + миграция supabase.cities.
 *   - Новый район → DISTRICTS объект (id, name, villages[]) — без миграции.
 *   - Новое село → DISTRICTS[<район>].villages — без миграции.
 *
 * **Будущая миграция:** перенос всего в таблицу `locations(id, name, type, parent_id, lat, lng)`
 * в Supabase, чтобы admin мог добавлять локации без code-deploy.
 * См. TASKS.md follow-up «Миграция БД locations».
 */

// ============================================================================
// CITIES — 8 крупных населённых пунктов РИ (включая 3 больших села Сунженского
// района, которые по населению > 15К и фактически городские центры).
// ============================================================================

/** id из таблицы supabase.cities (text PK), name на русском.
 *  `hiddenInPicker` — запись остаётся в MAJOR_CITIES (нужна для name lookup
 *  существующих заказов / профилей и для CITY_COORDINATES geocoding), но
 *  не показывается в city-picker UI. См. фидбэк user 2026-05-15:
 *  «убрать раздельные Назрань и Магас, оставить только Назрань · Магас». */
export interface CityRecord {
  id: string;
  name: string;
  hiddenInPicker?: boolean;
}

/** Города из supabase.cities (5) + 3 крупных села Сунженского района,
 *  добавленных как top-level cities (миграция 0050) + парная запись
 *  «Назрань · Магас» (миграция 0051, sort_order=0 — первой в picker'ах).
 *  Раздельные `nazran` и `magas` помечены `hiddenInPicker:true` — они
 *  остаются для backward-compat (старые записи в users.city_id /
 *  orders.city_id) но не дублируют опцию в picker'е. */
export const MAJOR_CITIES: readonly CityRecord[] = [
  { id: "nazran-magas", name: "Назрань · Магас" },
  { id: "nazran", name: "Назрань", hiddenInPicker: true },
  { id: "magas", name: "Магас", hiddenInPicker: true },
  { id: "karabulak", name: "Карабулак" },
  { id: "malgobek", name: "Малгобек" },
  { id: "sunzha", name: "Сунжа" },
  { id: "ordzhonikidzevskaya", name: "Орджоникидзевская" },
  { id: "sernovodskaya", name: "Серноводская" },
  { id: "nesterovskaya", name: "Нестеровская" },
] as const;

/** Города для отображения в picker'ах (city-selector, location-sheet,
 *  filter-sheet). Исключаем `hiddenInPicker`. Используй везде, где
 *  пользователь выбирает город из списка. */
export const PICKER_CITIES: readonly CityRecord[] = MAJOR_CITIES.filter((c) => !c.hiddenInPicker);

/**
 * 🚨 ПРАВИЛО (владелец 2026-05-24): Назрань и Магас — единая агломерация,
 * ВЕЗДЕ показываются ОДНОЙ плашкой «Назрань · Магас» (id `nazran-magas`),
 * никогда раздельно. Раздельные id `nazran` / `magas` остаются в БД только
 * для legacy-lookup имён старых записей — но в любых списках выбора скрыты.
 *
 * `HIDDEN_PICKER_CITY_IDS` — id, которые надо прятать из ВСЕХ списков выбора
 * города, включая БД-список `supabase.cities` (см. `useCities` — экран выбора
 * локации заказа берёт города оттуда, поэтому фильтр нужен и там, не только в
 * config-списке PICKER_CITIES).
 */
export const HIDDEN_PICKER_CITY_IDS: readonly string[] = MAJOR_CITIES.filter(
  (c) => c.hiddenInPicker,
).map((c) => c.id);

/** Спец-id «парных» городов — для master-feed: заказ city_id='nazran-magas'
 *  виден мастерам Назрани И Магаса. См. follow-up в TASKS.md. */
export const PAIR_CITIES: Record<string, readonly string[]> = {
  "nazran-magas": ["nazran", "magas"],
};

/** Город по умолчанию для нового пользователя без AsyncStorage / без геолокации.
 *  Пара `nazran-magas` (миграция 0051), потому что Назрань и Магас фактически
 *  единая агломерация — раздельные id оставлены `hiddenInPicker` только для
 *  backward-compat старых записей. */
export const DEFAULT_CITY_ID = "nazran-magas";

/** Нормализатор legacy cityId. Старые AsyncStorage / users.city_id могут
 *  содержать раздельные `nazran` / `magas` (до миграции 0051) — для UI
 *  превращаем их в пару. БД-значения не трогаем (фильтрация по PAIR_CITIES
 *  работает на серверном уровне), это чисто display-нормализация. */
export function normalizeCityId(id: string): string {
  if (id === "nazran" || id === "magas") return "nazran-magas";
  return id;
}

/** Спец-id для UI-значения «Вся Ингушетия» (на submit конвертируется в NULL
 *  для orders.city_id). См. миграцию 0049_orders_city_optional.sql. */
export const ALL_INGUSHETIA_CITY_ID = "all";

// ============================================================================
// COORDINATES — для Haversine getNearestCity(lat, lng).
// Точки — административные центры. Источник: open-data РИ.
// ============================================================================

/** Координаты только для опций, которые видны пользователю в picker
 *  (PICKER_CITIES). Раздельные `nazran` и `magas` намеренно НЕ включены —
 *  иначе `getNearestCity` мог бы вернуть один из них, и UI стал бы
 *  показывать «Назрань» вместо «Назрань · Магас». Точка `nazran-magas` —
 *  середина между двумя административными центрами. */
export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "nazran-magas": { lat: 43.1973, lng: 44.7862 },
  karabulak: { lat: 43.3105, lng: 44.8987 },
  malgobek: { lat: 43.5285, lng: 44.5926 },
  sunzha: { lat: 43.3262, lng: 45.0473 },
  ordzhonikidzevskaya: { lat: 43.2034, lng: 45.1257 },
  sernovodskaya: { lat: 43.3083, lng: 45.1531 },
  nesterovskaya: { lat: 43.218, lng: 45.218 },
};

/** Поиск ближайшего города по координатам. Haversine distance.
 *  Если до ближайшего города > thresholdKm — fallback на DEFAULT_CITY_ID. */
export function getNearestCity(lat: number, lng: number, thresholdKm = 30): string {
  const R = 6371; // радиус Земли, км
  const toRad = (d: number) => (d * Math.PI) / 180;

  let nearestId = DEFAULT_CITY_ID;
  let nearestKm = Infinity;

  for (const [id, c] of Object.entries(CITY_COORDINATES)) {
    const dLat = toRad(c.lat - lat);
    const dLng = toRad(c.lng - lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(c.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (km < nearestKm) {
      nearestKm = km;
      nearestId = id;
    }
  }
  return nearestKm <= thresholdKm ? nearestId : DEFAULT_CITY_ID;
}

// ============================================================================
// DISTRICTS — 4 муниципальных района РИ с вложенными сёлами.
// Структура повторяет Ingush-Business `DISTRICTS` для совместимости подхода.
// ============================================================================

export interface DistrictRecord {
  /** Стабильный slug для form-state / URL'ов. */
  id: string;
  /** Полное русское название для UI. */
  name: string;
  /** Сёла внутри района. Из них формируется FILTER_VILLAGES + sub-row в picker'ах. */
  villages: readonly string[];
}

export const DISTRICTS: readonly DistrictRecord[] = [
  {
    id: "nazranovsky",
    name: "Назрановский район",
    villages: [
      "Экажево",
      "Яндаре",
      "Плиево",
      "Сурхахи",
      "Кантышево",
      "Долаково",
      "Барсуки",
      "Альтиево",
      "Гамурзиево",
      "Али-Юрт",
    ],
  },
  {
    id: "sunzhensky",
    name: "Сунженский район",
    villages: ["Алхасты", "Аршты", "Берд-Юрт", "Галашки", "Даттых", "Чемульга"],
  },
  {
    id: "malgobeksky",
    name: "Малгобекский район",
    villages: [
      "Зязиков-Юрт",
      "Инарки",
      "Сагопши",
      "Пседах",
      "Верхние Ачалуки",
      "Средние Ачалуки",
      "Нижние Ачалуки",
      "Аки-Юрт",
    ],
  },
  {
    id: "dzheirakhsky",
    name: "Джейрахский район",
    villages: ["Джейрах", "Ляжги", "Армхи", "Ольгети", "Гули", "Бейни", "Эгикал", "Тарш"],
  },
] as const;

/** Удобный lookup-словарь: districtName → villages. Сохраняем русское имя
 *  как ключ потому что в orders.district хранится русское имя ("Назрановский район"). */
export const villagesByDistrict: Record<string, readonly string[]> = Object.fromEntries(
  DISTRICTS.map((d) => [d.name, d.villages]),
);

/** Список имён районов (для chip-row районов). */
export const districtNames: readonly string[] = DISTRICTS.map((d) => d.name);

// ============================================================================
// FILTER_VILLAGES — плоский список всех сёл (для Set<"v:село"> filter'ов
// в LocationFilterSheet, аналог Ingush-Business `FILTER_VILLAGES`).
// ============================================================================

export const FILTER_VILLAGES: readonly string[] = DISTRICTS.flatMap((d) => d.villages).sort(
  (a, b) => a.localeCompare(b, "ru"),
);

// ============================================================================
// HELPERS
// ============================================================================

/** Обратный lookup: село → родительский район-имя.
 *  Использовалось старым пикером локации; конструктор задания выбирает район целиком
 *  с district = имя села. */
const _villageToDistrict: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const d of DISTRICTS) {
    for (const village of d.villages) {
      map[village] = d.name;
    }
  }
  return map;
})();

export function findDistrictByVillage(value: string): string | undefined {
  return _villageToDistrict[value];
}

export function isDistrictName(value: string): boolean {
  return DISTRICTS.some((d) => d.name === value);
}

export function isVillageName(value: string): boolean {
  return value in _villageToDistrict;
}

/** Получить имя города по id из MAJOR_CITIES. Fallback на default.
 *  Применяет normalizeCityId — legacy `nazran` / `magas` отображаются как
 *  «Назрань · Магас» (единая агломерация). БД-значения нетронуты, это
 *  только display-уровень. */
export function getCityName(id: string): string {
  if (id === ALL_INGUSHETIA_CITY_ID) return "Вся Ингушетия";
  const normalized = normalizeCityId(id);
  return MAJOR_CITIES.find((c) => c.id === normalized)?.name ?? "Ингушетия";
}

// ============================================================================
// LocationFilter — тип для multi-select состояния (LocationSheet).
// Аналог Ingush-Business `LocationFilter`.
// ============================================================================

export interface LocationFilter {
  /** true = «Вся Ингушетия», cities + districts игнорируются. */
  isAll: boolean;
  /** city.id из MAJOR_CITIES. */
  cities: readonly string[];
  /** district.name (для совместимости с orders.district хранением). */
  districts: readonly string[];
}

export const EMPTY_LOCATION_FILTER: LocationFilter = {
  isAll: true,
  cities: [],
  districts: [],
};

/** Краткая label для LocationPill / chip-trigger.
 *  Примеры: "Ингушетия" / "Назрань, Магас" / "Назрань +2 / 1 район" / "Назрановский р-н". */
export function getLocationLabel(filter: LocationFilter): string {
  if (filter.isAll || (filter.cities.length === 0 && filter.districts.length === 0)) {
    return "Ингушетия";
  }
  const cityNames = filter.cities
    .map((id) => MAJOR_CITIES.find((c) => c.id === id)?.name)
    .filter((s): s is string => !!s);
  const districtShort = filter.districts.map((d) => d.replace(" район", " р-н"));

  if (cityNames.length === 1 && districtShort.length === 0) return cityNames[0] ?? "Ингушетия";
  if (cityNames.length === 0 && districtShort.length === 1) return districtShort[0] ?? "Ингушетия";
  if (cityNames.length <= 2 && districtShort.length === 0) return cityNames.join(", ");
  if (cityNames.length === 0 && districtShort.length <= 2) return districtShort.join(", ");

  // Длинная комбинация — компактный формат
  const parts: string[] = [];
  if (cityNames[0]) parts.push(cityNames[0]);
  const extraCities = cityNames.length - 1;
  if (extraCities > 0) parts.push(`+${extraCities}`);
  if (districtShort.length > 0) parts.push(`${districtShort.length} р-н`);
  return parts.join(" ");
}

// ============================================================================
// Set<"c:cityId"|"v:village">  utilities — для LocationFilterSheet
// (Ingush-Business `Set<string>` pattern).
// ============================================================================

export type LocSetItem = `c:${string}` | `v:${string}`;
export type LocSet = ReadonlySet<LocSetItem>;

export function locSetAddCity(set: LocSet, cityId: string): Set<LocSetItem> {
  const next = new Set(set);
  next.add(`c:${cityId}`);
  return next;
}

export function locSetAddVillage(set: LocSet, village: string): Set<LocSetItem> {
  const next = new Set(set);
  next.add(`v:${village}`);
  return next;
}

export function locSetToFilter(set: LocSet): LocationFilter {
  const cities: string[] = [];
  const villages: string[] = [];
  for (const item of set) {
    if (item.startsWith("c:")) cities.push(item.slice(2));
    else if (item.startsWith("v:")) villages.push(item.slice(2));
  }
  // villages пока не маппим обратно на districts — это специфично для
  // LocationFilterSheet (фильтр заказов по селу напрямую).
  return {
    isAll: cities.length === 0 && villages.length === 0,
    cities,
    districts: [], // см. ниже — для village-фильтра districts не нужны
  };
}
