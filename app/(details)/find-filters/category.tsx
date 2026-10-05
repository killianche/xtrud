/**
 * /find-filters/category — раздел для фильтра (№235): «Все категории» или
 * раздел → его подкатегории.
 */

import { useRouter } from "expo-router";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindFilterCategoryScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const l1Id = useOrdersSearchFiltersStore((s) => s.l1Id);
  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const setCategory = useOrdersSearchFiltersStore((s) => s.setCategory);
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  // Только разделы, где есть видимые подкатегории (как в каталоге).
  const list = (sections.data ?? []).filter((s) =>
    (categories.data ?? []).some((c) => c.l1_id === s.id),
  );
  const loading = sections.isLoading || categories.isLoading;
  const failed = !loading && (sections.error || categories.error);

  return (
    <FilterSheetScreen title="Категория" onBack={() => router.back()}>
      <InsetGroup>
        <InsetRow
          title="Все категории"
          selected={l2Ids.length === 0}
          onPress={() => {
            setCategory("", []);
            router.back();
          }}
          last
        />
      </InsetGroup>
      {loading ? (
        <InsetGroup>
          {[0, 1, 2, 3, 4].map((i) => (
            <InsetRow key={i} title="" icon={<Skeleton width={120} height={16} />} last={i === 4} />
          ))}
        </InsetGroup>
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
        <InsetGroup title="Разделы">
          {list.map((s, i) => {
            const Icon = getCategoryIcon(s.icon);
            return (
              <InsetRow
                key={s.id}
                title={s.name_ru}
                icon={<Icon size={18} weight="bold" color={tc.ink} />}
                value={l1Id === s.id && l2Ids.length > 0 ? "Выбрано" : undefined}
                navigates
                onPress={() =>
                  router.push({ pathname: "/find-filters/section", params: { id: s.id } } as never)
                }
                last={i === list.length - 1}
              />
            );
          })}
        </InsetGroup>
      )}
    </FilterSheetScreen>
  );
}
