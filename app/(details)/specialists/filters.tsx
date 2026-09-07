/**
 * /specialists/filters — фильтры списка специалистов в той же системной шторке,
 * что и у ленты заданий (DECISION владельца 2026-09-07: «на специалистах
 * фильтры того же типа»): «Категория» → шторка выбора поверх, «Город» и
 * «Сортировка» — списки с галочкой. Применяется сразу.
 */

import { Stack, useRouter } from "expo-router";
import { CITIES } from "@/components/CitySelector";
import { FilterSheetPage, InsetGroup, InsetRow } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  countSpecialistsFilters,
  SORT_LABEL,
  useSpecialistsFiltersStore,
} from "@/features/master-view/specialists-filters-store";
import type { MasterSort } from "@/features/master-view/use-search-masters";
import { hapticSelection } from "@/lib/haptics";

const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.7, 1.0],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
};

const SORTS: MasterSort[] = ["rating", "experience", "availability"];

export default function SpecialistsFiltersScreen() {
  const router = useRouter();
  const f = useSpecialistsFiltersStore();
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  const activeCount = countSpecialistsFilters(f);

  const categoryLabel = f.l2Id
    ? (categories.data?.find((c) => c.id === f.l2Id)?.name_ru ?? "Категория")
    : f.l1Id
      ? (sections.data?.find((s) => s.id === f.l1Id)?.name_ru ?? "Раздел")
      : "Все категории";

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <FilterSheetPage
        title="Фильтры"
        onDone={() => router.back()}
        onReset={f.clearAll}
        resetVisible={activeCount > 0}
      >
        <InsetGroup title="Категория">
          <InsetRow
            title="Категория"
            value={categoryLabel}
            navigates
            onPress={() =>
              router.push({
                pathname: "/specialists/category-select",
                params: { l1: f.l1Id ?? "", l2: f.l2Id ?? "" },
              } as never)
            }
            last
          />
        </InsetGroup>

        <InsetGroup title="Город">
          {CITIES.map((c, i) => (
            <InsetRow
              key={c.id}
              title={c.id === "all" ? "Вся Ингушетия" : c.name}
              checked={f.cityId === c.id}
              onPress={() => {
                hapticSelection();
                f.setCity(c.id);
              }}
              last={i === CITIES.length - 1}
            />
          ))}
        </InsetGroup>

        <InsetGroup title="Сортировка" footer="Фильтры применяются сразу.">
          {SORTS.map((s, i) => (
            <InsetRow
              key={s}
              title={SORT_LABEL[s]}
              checked={f.sort === s}
              onPress={() => {
                hapticSelection();
                f.setSort(s);
              }}
              last={i === SORTS.length - 1}
            />
          ))}
        </InsetGroup>
      </FilterSheetPage>
    </>
  );
}
