/**
 * /find-category/section?id= — подкатегории раздела (№238) с иконками.
 * Касание подкатегории — сразу её задания, шторка закрывается. Весь раздел —
 * плавающая кнопка внизу (владелец, 2026-10-08, №320: строка «Весь раздел»
 * сверху была незаметной).
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "phosphor-react-native";
import { FloatingPillButton, InsetGroup, InsetRow } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { closeFilterSheet, FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { pluralizeRu } from "@/lib/pluralize";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindCategorySectionScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink", "on-accent"]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const l1Id = useOrdersSearchFiltersStore((s) => s.l1Id);
  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const wholeSection = useOrdersSearchFiltersStore((s) => s.wholeSection);
  const setCategory = useOrdersSearchFiltersStore((s) => s.setCategory);
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  const section = sections.data?.find((s) => s.id === id);
  const items = (categories.data ?? []).filter((c) => c.l1_id === id);
  if (!id || (sections.data && !section)) return <Redirect href="/find-category" />;

  const wholeChosen = l1Id === id && wholeSection;
  const pick = (next: string[], whole: boolean) => {
    setCategory(id, next, whole);
    closeFilterSheet(router, "nested");
  };

  return (
    <FilterSheetScreen
      title={section?.name_ru ?? "Раздел"}
      onBack={() => router.back()}
      onClose={() => closeFilterSheet(router, "nested")}
      footer={(bottom) => (
        <FloatingPillButton
          label={wholeChosen ? "Весь раздел выбран" : "Показать весь раздел"}
          accessibilityLabel={`Показать весь раздел, ${items.length} ${pluralizeRu(items.length, {
            one: "подкатегория",
            few: "подкатегории",
            many: "подкатегорий",
          })}`}
          icon={wholeChosen ? <Check size={18} weight="bold" color={tc["on-accent"]} /> : undefined}
          onPress={() =>
            pick(
              items.map((c) => c.id),
              true,
            )
          }
          bottom={bottom}
        />
      )}
    >
      <InsetGroup title="Подкатегория">
        {items.map((c, i) => {
          const Icon = getCategoryIcon(c.icon);
          return (
            <InsetRow
              key={c.id}
              title={c.name_ru}
              icon={<Icon size={18} weight="bold" color={tc.ink} />}
              checked={!wholeChosen && l2Ids.length === 1 && l2Ids[0] === c.id}
              onPress={() => pick([c.id], false)}
              last={i === items.length - 1}
            />
          );
        })}
      </InsetGroup>
    </FilterSheetScreen>
  );
}
