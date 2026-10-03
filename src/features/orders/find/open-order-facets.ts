/**
 * Сколько открытых заданий в каждой категории и месте — для экрана выбора
 * «Найти задание» (как у Airbnb: «Показать 12 вариантов»). Считается на
 * устройстве по одному лёгкому запросу (use-open-order-facets.ts), потому
 * что открытых заданий — десятки, а не тысячи.
 *
 * Правила совпадают с лентой (use-all-open-orders.ts):
 *  - задание входит в категорию по основной или дополнительной (0195);
 *  - выбран город — видны и задания, размещённые на весь его район;
 *    выбран район — видны и задания его городов (location-config.ts).
 */

import { cityIdsOfDistrictName, districtNameOfCityId } from "@/lib/location-config";
import { orderCategoryIds } from "../order-categories";

export interface OpenOrderFacetRow {
  l2_id: string | null;
  extra_l2_ids?: readonly string[] | null;
  city_id: string | null;
  district: string | null;
}

export interface PlaceFilter {
  cityId: string;
  district: string;
}

/** Подходит ли задание под место. Пустое место — «Вся Ингушетия». */
export function matchesPlace(row: OpenOrderFacetRow, place: PlaceFilter): boolean {
  if (place.cityId) {
    if (row.city_id === place.cityId) return true;
    const districtOfCity = districtNameOfCityId(place.cityId);
    return !!districtOfCity && row.district === districtOfCity;
  }
  if (place.district) {
    if (row.district === place.district) return true;
    return !!row.city_id && cityIdsOfDistrictName(place.district).includes(row.city_id);
  }
  return true;
}

/** Число заданий по каждой категории (L2) в выбранном месте. */
export function countByCategory(
  rows: readonly OpenOrderFacetRow[],
  place: PlaceFilter = { cityId: "", district: "" },
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!matchesPlace(row, place)) continue;
    for (const id of orderCategoryIds(row)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Число заданий раздела: задание считается один раз, даже если две его
 * категории лежат в одном разделе.
 */
export function countInCategories(
  rows: readonly OpenOrderFacetRow[],
  l2Ids: ReadonlySet<string>,
  place: PlaceFilter = { cityId: "", district: "" },
): number {
  let n = 0;
  for (const row of rows) {
    if (!matchesPlace(row, place)) continue;
    if (orderCategoryIds(row).some((id) => l2Ids.has(id))) n += 1;
  }
  return n;
}
