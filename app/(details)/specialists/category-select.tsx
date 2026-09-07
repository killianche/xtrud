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
import { PickerSheetPage, type PickerSheetRow, type PickerSheetSection } from "@/components/ui";
import { useCategoryFilterPickerStore } from "@/features/categories/category-filter-picker-store";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";

const ALL_ID = "__all";
const SECTION_PREFIX = "l1:";

// Параметры шторки — константа модуля. Объект, создаваемый заново при каждом
// рендере, заставлял систему переоткрывать шторку и сбрасывать выбор
// (владелец, 2026-09-07: «нажимаю категорию — не выбирается, шторка
// открывается повторно»).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.7, 1.0],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
};

export default function SpecialistsCategorySelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ l1?: string; l2?: string }>();
  const setCategoryResult = useCategoryFilterPickerStore((s) => s.setCategoryResult);
  const tc = useThemeColors(["ink", "on-accent"]);
  const sections_ = useCategoriesL1();
  const categories = useVisibleCategories();

  const currentId = params.l2 ? params.l2 : params.l1 ? `${SECTION_PREFIX}${params.l1}` : ALL_ID;

  // Группы inset grouped: «Все категории» отдельно, дальше по разделу на
  // группу. Первая строка группы — «Весь раздел» с залитой акцентом плиткой:
  // так видно, что это раздел целиком, а не ещё одна категория (DECISION
  // владельца 2026-09-06, вечер).
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
    for (const section of sections_.data ?? []) {
      const SectionIcon = getCategoryIcon(section.icon);
      const rows: PickerSheetRow[] = [
        {
          id: `${SECTION_PREFIX}${section.id}`,
          title: "Весь раздел",
          subtitle: section.name_ru,
          icon: <SectionIcon size={17} weight="bold" color={tc["on-accent"]} />,
          emphasis: true,
        },
      ];
      for (const category of (categories.data ?? []).filter((c) => c.l1_id === section.id)) {
        const Icon = getCategoryIcon(category.icon);
        rows.push({
          id: category.id,
          title: category.name_ru,
          icon: <Icon size={17} weight="bold" color={tc.ink} />,
        });
      }
      list.push({ id: section.id, title: section.name_ru, options: rows });
    }
    return list;
  }, [sections_.data, categories.data, tc.ink, tc["on-accent"]]);

  const close = () => router.back();

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <PickerSheetPage
        title="Категория"
        sections={sections}
        selectedId={currentId}
        searchable
        searchPlaceholder="Например, электрик или уборка"
        loading={sections_.isLoading || categories.isLoading}
        errorMessage={
          sections_.error || categories.error ? "Не удалось загрузить категории" : undefined
        }
        onRetry={() => {
          void sections_.refetch();
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
