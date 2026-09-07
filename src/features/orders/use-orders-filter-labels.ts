/**
 * Подписи выбранных фильтров ленты «Задания» — одна логика для шапки ленты и
 * шторки «Фильтры». Без сети берутся встроенный каталог и кэш городов.
 */

import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";

export const CATEGORY_ANY = "Все категории";
export const LOCATION_ANY = "Вся Ингушетия";

export function useOrdersFilterLabels() {
  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const categoriesQ = useVisibleCategories();
  const citiesQ = useCities();
  const l1Q = useCategoriesL1();

  let category = CATEGORY_ANY;
  if (l2Ids.length > 0) {
    // Раздел целиком — его название; одна категория — её; иначе счётчик.
    const section = (l1Q.data ?? []).find((s) => {
      const ids = (categoriesQ.data ?? []).filter((c) => c.l1_id === s.id).map((c) => c.id);
      return ids.length > 0 && ids.length === l2Ids.length && ids.every((id) => l2Ids.includes(id));
    });
    if (section) category = section.name_ru;
    else if (l2Ids.length === 1)
      category = categoriesQ.data?.find((c) => c.id === l2Ids[0])?.name_ru ?? "Категория";
    else category = `Категории · ${l2Ids.length}`;
  }

  const location = cityId
    ? (citiesQ.data?.find((c) => c.id === cityId)?.name ?? "Город")
    : district || LOCATION_ANY;

  return {
    category,
    location,
    categoryActive: l2Ids.length > 0,
    locationActive: !!(cityId || district),
  };
}
