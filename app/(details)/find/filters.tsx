/**
 * /find/filters — фильтры ленты «Задания» в системной шторке, как у Apple:
 * «Сбросить · Фильтры · Готово», группа «Категория» (строка со значением и
 * шевроном → шторка выбора поверх), группа «Место» — список с галочкой.
 * Значения применяются к ленте сразу, стор общий с лентой.
 * DECISION владельца 2026-09-07: «полный редизайн под Apple».
 */

import { Stack, useRouter } from "expo-router";
import { FilterSheetPage, InsetGroup, InsetRow } from "@/components/ui";
import { useCities } from "@/features/cities/use-cities";
import { districtOptions } from "@/features/orders/order-schema";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useOrdersFilterLabels } from "@/features/orders/use-orders-filter-labels";
import { hapticSelection } from "@/lib/haptics";

// Константа модуля: новый объект на каждый рендер переоткрывает шторку.
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.7, 1.0],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
};

export default function OrdersSearchFiltersScreen() {
  const router = useRouter();
  const filters = useOrdersSearchFiltersStore();
  const labels = useOrdersFilterLabels();
  const cities = useCities();
  const activeCount = countActiveFilters(filters);
  const noLocation = !filters.cityId && !filters.district;

  const pick = (cityId: string, district: string) => {
    hapticSelection();
    filters.setLocation(cityId, district);
  };

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <FilterSheetPage
        title="Фильтры"
        onDone={() => router.back()}
        onReset={filters.clearAll}
        resetVisible={activeCount > 0}
      >
        <InsetGroup title="Категория">
          <InsetRow
            title="Категория"
            value={labels.category}
            navigates
            onPress={() => router.push("/find/category-select" as never)}
            last
          />
        </InsetGroup>

        <InsetGroup title="Место" footer="Фильтры применяются сразу.">
          <InsetRow title="Вся Ингушетия" checked={noLocation} onPress={() => pick("", "")} />
          {(cities.data ?? []).map((c) => (
            <InsetRow
              key={c.id}
              title={c.name}
              checked={filters.cityId === c.id}
              onPress={() => pick(c.id, "")}
            />
          ))}
          {districtOptions.map((d, i) => (
            <InsetRow
              key={d}
              title={d}
              subtitle="Район"
              checked={filters.district === d}
              onPress={() => pick("", d)}
              last={i === districtOptions.length - 1}
            />
          ))}
        </InsetGroup>
      </FilterSheetPage>
    </>
  );
}
