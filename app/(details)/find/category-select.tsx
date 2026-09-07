/**
 * /find/category-select — категория для ленты заданий. Та же шторка, что у
 * «Специалистов» (DECISION владельца 2026-09-07: «фильтры категории на
 * страницах должны быть в одном стиле»): «Все категории», затем разделы с
 * первой строкой «Весь раздел» и категориями внутри, один выбор — галочка.
 * Раздел целиком = все его категории в фильтре ленты.
 */

import { Stack, useRouter } from "expo-router";
import { SquaresFour } from "phosphor-react-native";
import { useMemo } from "react";
import { PickerSheetPage, type PickerSheetRow, type PickerSheetSection } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

const ALL_ID = "__all";
const SECTION_PREFIX = "l1:";

// Параметры шторки — константа модуля: новый объект на каждый рендер
// заставлял систему переоткрывать шторку и сбрасывать выбор.
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.75, 1.0],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
};

export default function OrdersSearchCategorySelectScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink", "on-accent"]);
  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const setL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();

  const sections = useMemo<PickerSheetSection[]>(() => {
    const list: PickerSheetSection[] = [
      {
        id: "__all",
        options: [
          {
            id: ALL_ID,
            title: "Все категории",
            icon: <SquaresFour size={17} weight="bold" color={tc["on-accent"]} />,
            emphasis: true,
          },
        ],
      },
    ];
    for (const section of l1.data ?? []) {
      const inSection = (categories.data ?? []).filter((c) => c.l1_id === section.id);
      if (inSection.length === 0) continue;
      const SectionIcon = getCategoryIcon(section.icon);
      const rows: PickerSheetRow[] = [
        {
          id: `${SECTION_PREFIX}${section.id}`,
          title: "Весь раздел",
          subtitle: section.name_ru,
          icon: <SectionIcon size={17} weight="bold" color={tc["on-accent"]} />,
          emphasis: true,
        },
        ...inSection.map((c) => {
          const Icon = getCategoryIcon(c.icon);
          return {
            id: c.id,
            title: c.name_ru,
            icon: <Icon size={17} weight="bold" color={tc.ink} />,
          };
        }),
      ];
      list.push({ id: section.id, title: section.name_ru, options: rows });
    }
    return list;
  }, [l1.data, categories.data, tc.ink, tc["on-accent"]]);

  // Текущее значение: раздел целиком, если выбраны ровно все его категории.
  const currentId = useMemo(() => {
    if (l2Ids.length === 0) return ALL_ID;
    for (const section of l1.data ?? []) {
      const ids = (categories.data ?? []).filter((c) => c.l1_id === section.id).map((c) => c.id);
      if (ids.length > 0 && ids.length === l2Ids.length && ids.every((id) => l2Ids.includes(id))) {
        return `${SECTION_PREFIX}${section.id}`;
      }
    }
    return l2Ids.length === 1 ? (l2Ids[0] ?? ALL_ID) : ALL_ID;
  }, [l2Ids, l1.data, categories.data]);

  const close = () => router.back();
  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <PickerSheetPage
        title="Категория"
        sections={sections}
        selectedId={currentId}
        onSelect={(id) => {
          hapticSelection();
          if (id === ALL_ID) setL2Ids([]);
          else if (id.startsWith(SECTION_PREFIX)) {
            const sectionId = id.slice(SECTION_PREFIX.length);
            setL2Ids((categories.data ?? []).filter((c) => c.l1_id === sectionId).map((c) => c.id));
          } else setL2Ids([id]);
          close();
        }}
        searchable
        searchPlaceholder="Например, электрик или уборка"
        loading={categories.isLoading || l1.isLoading}
        errorMessage={categories.error || l1.error ? "Не удалось загрузить категории" : undefined}
        onRetry={() => {
          void categories.refetch();
          void l1.refetch();
        }}
        onClose={close}
      />
    </>
  );
}
