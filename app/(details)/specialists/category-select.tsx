/**
 * /specialists/category-select — выбор категории для экрана «Специалисты».
 *
 * Два уровня в одном списке: раздел (крупная категория с главной) и
 * категории внутри него. Выбрать можно и раздел целиком («все сантехники и
 * электрики»), и одну категорию. Первая строка — «Все категории».
 *
 * Тот же паттерн, что у остальных пикеров: нативная formSheet-модальность,
 * результат уходит через `useCategoryFilterPickerStore` + `router.back()`.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SquaresFour } from "phosphor-react-native";
import { useMemo } from "react";
import { type PickerOption, PickerSheetPage } from "@/components/ui";
import { useCategoryFilterPickerStore } from "@/features/categories/category-filter-picker-store";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";

const ALL_ID = "__all";
const SECTION_PREFIX = "l1:";

export default function SpecialistsCategorySelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ l1?: string; l2?: string }>();
  const setCategoryResult = useCategoryFilterPickerStore((s) => s.setCategoryResult);
  const tc = useThemeColors(["ink", "mute", "accent"]);
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();

  const currentId = params.l2 ? params.l2 : params.l1 ? `${SECTION_PREFIX}${params.l1}` : ALL_ID;

  const options = useMemo<PickerOption[]>(() => {
    const list: PickerOption[] = [
      {
        id: ALL_ID,
        title: "Все категории",
        icon: <SquaresFour size={18} weight="bold" color={tc.ink} />,
      },
    ];
    for (const section of sections.data ?? []) {
      const SectionIcon = getCategoryIcon(section.icon);
      list.push({
        id: `${SECTION_PREFIX}${section.id}`,
        title: section.name_ru,
        subtitle: "Весь раздел",
        icon: <SectionIcon size={18} weight="bold" color={tc.accent} />,
      });
      for (const category of (categories.data ?? []).filter((c) => c.l1_id === section.id)) {
        const Icon = getCategoryIcon(category.icon);
        list.push({
          id: category.id,
          title: category.name_ru,
          icon: <Icon size={18} weight="bold" color={tc.mute} />,
        });
      }
    }
    return list;
  }, [sections.data, categories.data, tc.ink, tc.accent, tc.mute]);

  const close = () => router.back();

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.7, 1.0],
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: true,
        }}
      />
      <PickerSheetPage
        title="Категория"
        options={options}
        selectedId={currentId}
        searchable
        searchPlaceholder="Например, электрик или уборка"
        loading={sections.isLoading || categories.isLoading}
        errorMessage={
          sections.error || categories.error ? "Не удалось загрузить категории" : undefined
        }
        onRetry={() => {
          void sections.refetch();
          void categories.refetch();
        }}
        onSelect={(id) => {
          if (id === ALL_ID) setCategoryResult({ l1Id: null, l2Id: null });
          else if (id.startsWith(SECTION_PREFIX))
            setCategoryResult({ l1Id: id.slice(SECTION_PREFIX.length), l2Id: null });
          else setCategoryResult({ l1Id: null, l2Id: id });
          close();
        }}
        onClose={close}
      />
    </>
  );
}
