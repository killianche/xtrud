/**
 * Поиск места в шторке «Место» (№244): город, район или село одним полем —
 * село находится сразу, без знания района (как место у Авито).
 * Чистая функция — проверяется тестами.
 */

import { DISTRICTS, PICKER_CITIES } from "@/lib/location-config";

export interface PlaceResult {
  kind: "city" | "district" | "village";
  title: string;
  subtitle: string;
  /** Что записать в фильтр: setLocation(cityId, district, village). */
  cityId: string;
  district: string;
  village: string;
}

function norm(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim();
}

/**
 * Совпадение с начала любого слова: «экаж» → Экажево, «наз» → Назрань.
 * «район» в названиях общее — по нему не ищем, иначе находятся все районы.
 */
function matches(name: string, q: string): boolean {
  return norm(name)
    .split(/[\s·-]+/)
    .some((word) => word !== "район" && word.startsWith(q));
}

export function searchPlaces(query: string, limit = 12): PlaceResult[] {
  const q = norm(query);
  if (!q) return [];
  const out: PlaceResult[] = [];
  for (const c of PICKER_CITIES) {
    if (matches(c.name, q)) {
      out.push({
        kind: "city",
        title: c.name,
        subtitle: "Город",
        cityId: c.id,
        district: "",
        village: "",
      });
    }
  }
  for (const d of DISTRICTS) {
    if (matches(d.name, q)) {
      out.push({
        kind: "district",
        title: d.name,
        subtitle: "Весь район",
        cityId: "",
        district: d.name,
        village: "",
      });
    }
  }
  for (const d of DISTRICTS) {
    for (const v of d.villages) {
      if (matches(v, q)) {
        out.push({
          kind: "village",
          title: v,
          subtitle: d.name,
          cityId: "",
          district: d.name,
          village: v,
        });
      }
    }
  }
  return out.slice(0, limit);
}
