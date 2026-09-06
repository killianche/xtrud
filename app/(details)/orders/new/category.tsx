/**
 * /orders/new/category — категория из списка: системная шторка с группами по
 * разделам (тот же `PickerSheetPage`, что у фильтров). Выбор пишется в
 * конструктор и шторка закрывается.
 */

import { Stack, useRouter } from "expo-router";
import { useMemo } from "react";
import { PickerSheetPage, type PickerSheetRow, type PickerSheetSection } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useComposer } from "@/features/task-composer/composer-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

export default function TaskCategorySheet() {
  const router = useRouter();
  const { values, patch } = useComposer();
  const tc = useThemeColors(["ink"]);
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();

  const sections = useMemo<PickerSheetSection[]>(() => {
    const byL1 = new Map<string, PickerSheetRow[]>();
    for (const c of categories.data ?? []) {
      const Icon = getCategoryIcon(c.icon);
      const rows = byL1.get(c.l1_id) ?? [];
      rows.push({
        id: c.id,
        title: c.name_ru,
        icon: <Icon size={17} weight="bold" color={tc.ink} />,
      });
      byL1.set(c.l1_id, rows);
    }
    const ordered = (l1.data ?? []).filter((s) => byL1.has(s.id));
    const known = new Set(ordered.map((s) => s.id));
    return [
      ...ordered.map((s) => ({ id: s.id, title: s.name_ru, options: byL1.get(s.id) ?? [] })),
      ...[...byL1.keys()]
        .filter((id) => !known.has(id))
        .map((id) => ({ id, options: byL1.get(id) ?? [] })),
    ];
  }, [categories.data, l1.data, tc.ink]);

  const close = () => router.back();
  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1.0],
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: true,
        }}
      />
      <PickerSheetPage
        title="Категория"
        sections={sections}
        selectedId={values.l2Id || null}
        onSelect={(id) => {
          hapticSelection();
          patch({ l2Id: id });
          close();
        }}
        searchable
        searchPlaceholder="Например, окна, обои или уборка"
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
