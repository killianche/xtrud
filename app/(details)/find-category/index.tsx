/**
 * /find-category — категория для «Найти задание» (№238): поиск, «Все
 * категории», разделы плитками с 3D-иконками (как в каталоге); выбранный
 * раздел обведён. Раздел → его подкатегории; раздел из одной подкатегории
 * выбирается сразу (№239).
 */

import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { InsetGroup, InsetRow, SearchField } from "@/components/ui";
import { CategoryMatches } from "@/features/categories/CategoryMatches";
import { onlyCategoryId } from "@/features/categories/only-category";
import { SectionGrid, SectionGridSkeleton } from "@/features/categories/SectionGrid";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { closeFilterSheet, FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { FEATURED_SECTION_IDS } from "@/lib/product-scope";

export default function FindCategoryScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const l1Id = useOrdersSearchFiltersStore((s) => s.l1Id);
  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const setCategory = useOrdersSearchFiltersStore((s) => s.setCategory);
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  const tiles = (sections.data ?? [])
    .filter((s) => (categories.data ?? []).some((c) => c.l1_id === s.id))
    .map((s) => ({ id: s.id, name: s.name_ru, icon: s.icon }));
  const loading = sections.isLoading || categories.isLoading;
  const failed = !loading && (sections.error || categories.error);

  const pickL2 = (l2Id: string) => {
    const l1 = categories.data?.find((c) => c.id === l2Id)?.l1_id ?? "";
    setCategory(l1, [l2Id], false);
    closeFilterSheet(router, "first");
  };

  return (
    <FilterSheetScreen
      title="Категория"
      subtitle="Какие задания показать"
      onClose={() => closeFilterSheet(router, "first")}
      header={
        <View className="mb-5 px-4">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Например, электрик или уборка"
            accessibilityLabel="Поиск категории"
          />
        </View>
      }
    >
      {query.trim().length > 0 ? (
        <CategoryMatches query={query} onPick={pickL2} />
      ) : (
        <>
          <InsetGroup>
            <InsetRow
              title="Все категории"
              checked={l2Ids.length === 0}
              onPress={() => {
                setCategory("", []);
                closeFilterSheet(router, "first");
              }}
              last
            />
          </InsetGroup>
          {loading ? (
            <SectionGridSkeleton />
          ) : failed ? (
            <InsetGroup footer="Не удалось загрузить категории. Проверьте связь.">
              <InsetRow
                title="Повторить"
                onPress={() => {
                  void sections.refetch();
                  void categories.refetch();
                }}
                last
              />
            </InsetGroup>
          ) : (
            <SectionGrid
              tiles={tiles}
              featuredIds={FEATURED_SECTION_IDS}
              selectedId={l2Ids.length > 0 ? l1Id : null}
              onPress={(id) => {
                const only = onlyCategoryId(categories.data ?? [], id);
                if (only) pickL2(only);
                else router.push({ pathname: "/find-category/section", params: { id } } as never);
              }}
            />
          )}
        </>
      )}
    </FilterSheetScreen>
  );
}
