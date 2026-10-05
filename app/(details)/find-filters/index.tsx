/**
 * /find-filters — «Фильтры»: категория и место (№235). Значения справа —
 * что выбрано сейчас; тап открывает выбор.
 */

import { useRouter } from "expo-router";
import { MapPin, SquaresFour } from "phosphor-react-native";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { categoryLabel, placeLabel } from "@/features/orders/find/filter-summary";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindFiltersScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const filters = useOrdersSearchFiltersStore();
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  const input = {
    l1Id: filters.l1Id,
    l2Ids: filters.l2Ids,
    wholeSection: filters.wholeSection,
    cityId: filters.cityId,
    district: filters.district,
    village: filters.village,
    sectionName: (id: string) => sections.data?.find((s) => s.id === id)?.name_ru,
    categoryName: (id: string) => categories.data?.find((c) => c.id === id)?.name_ru,
  };

  return (
    <FilterSheetScreen title="Фильтры" onReset={filters.clearAll} onDone={() => router.back()}>
      <InsetGroup footer="Задания в списке обновляются сразу.">
        <InsetRow
          title="Категория"
          value={categoryLabel(input) ?? "Все"}
          icon={<SquaresFour size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/find-filters/category" as never)}
        />
        <InsetRow
          title="Место"
          value={placeLabel(input) ?? "Вся Ингушетия"}
          icon={<MapPin size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/find-filters/place" as never)}
          last
        />
      </InsetGroup>
    </FilterSheetScreen>
  );
}
