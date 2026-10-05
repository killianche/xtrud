/**
 * Подписи капсул «Найти задание» (№235, №238): категория («Обои», раздел
 * для «Весь раздел») и место («Экажево, Назрановский р-н»). Чистые функции —
 * тестируются.
 */

import { ALL_INGUSHETIA_CITY_ID, getCityName } from "@/lib/location-config";

export interface FilterSummaryInput {
  l1Id: string;
  l2Ids: readonly string[];
  /** Выбран «Весь раздел» — подпись разделом, даже если подкатегория одна. */
  wholeSection?: boolean;
  cityId: string;
  district: string;
  village: string;
  sectionName: (id: string) => string | undefined;
  categoryName: (id: string) => string | undefined;
}

export function categoryLabel(i: FilterSummaryInput): string | null {
  if (i.l2Ids.length === 0) return null;
  if (i.wholeSection) return i.sectionName(i.l1Id) ?? "Раздел";
  if (i.l2Ids.length === 1) {
    const only = i.l2Ids[0] ?? "";
    return i.categoryName(only) ?? i.sectionName(i.l1Id) ?? "Категория";
  }
  return i.sectionName(i.l1Id) ?? `Категорий: ${i.l2Ids.length}`;
}

export function placeLabel(i: FilterSummaryInput): string | null {
  if (i.cityId && i.cityId !== ALL_INGUSHETIA_CITY_ID) return getCityName(i.cityId);
  if (i.district && i.village) return `${i.village}, ${i.district.replace(" район", " р-н")}`;
  if (i.district) return i.district;
  return null;
}
