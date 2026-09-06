/**
 * /find/category-select — выбор категорий для фильтра ленты заданий.
 *
 * DECISION владельца 2026-09-06: фильтры — как в последнем iOS. У Apple
 * подробный выбор живёт в системной шторке со списком и галочками, а лёгкая
 * фильтрация — чипами под полем поиска (WWDC26 «Design intuitive search
 * experiences»). Здесь — шторка: formSheet, поиск по каталогу, галочки у
 * выбранных, «Готово» внизу. Выбор коммитится в store только по «Готово»;
 * закрыть шторку жестом — значит ничего не менять.
 */

import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { PickerSheetPage, type PickerSheetRow, type PickerSheetSection } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

export default function OrdersSearchCategorySelectScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink", "accent"]);
  const storeL2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const setStoreL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  const [selected, setSelected] = useState<string[]>(storeL2Ids);
  const categories = useVisibleCategories();

  // Группы по разделам каталога — как inset grouped список в Настройках.
  const l1 = useCategoriesL1();
  const sections = useMemo<PickerSheetSection[]>(() => {
    const byL1 = new Map<string, PickerSheetRow[]>();
    for (const category of categories.data ?? []) {
      const Icon = getCategoryIcon(category.icon);
      const active = selected.includes(category.id);
      const rows = byL1.get(category.l1_id) ?? [];
      rows.push({
        id: category.id,
        title: category.name_ru,
        icon: <Icon size={17} weight="bold" color={active ? tc.accent : tc.ink} />,
      });
      byL1.set(category.l1_id, rows);
    }
    const ordered = (l1.data ?? []).filter((s) => byL1.has(s.id));
    const known = new Set(ordered.map((s) => s.id));
    const rest = [...byL1.keys()].filter((id) => !known.has(id));
    return [
      ...ordered.map((s) => ({ id: s.id, title: s.name_ru, options: byL1.get(s.id) ?? [] })),
      ...rest.map((id) => ({ id, options: byL1.get(id) ?? [] })),
    ];
  }, [categories.data, l1.data, selected, tc.accent, tc.ink]);

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
        title="Категории"
        subtitle={selected.length > 0 ? `Выбрано: ${selected.length}` : "Можно выбрать несколько"}
        sections={sections}
        selectedId=""
        onSelect={() => undefined}
        multiSelect
        selectedIds={selected}
        onToggle={(id) => {
          hapticSelection();
          setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
        }}
        onDone={() => {
          setStoreL2Ids(selected);
          close();
        }}
        doneLabel="Готово"
        searchable
        searchPlaceholder="Например, сантехник или уборка"
        resettable
        resetLabel="Сбросить"
        loading={categories.isLoading}
        errorMessage={categories.error ? "Не удалось загрузить категории" : undefined}
        onRetry={() => void categories.refetch()}
        onClose={close}
      />
    </>
  );
}
