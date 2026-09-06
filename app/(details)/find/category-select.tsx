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
import { type PickerOption, PickerSheetPage } from "@/components/ui";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

export default function OrdersSearchCategorySelectScreen() {
  const router = useRouter();
  const tc = useThemeColors(["mute", "accent"]);
  const storeL2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const setStoreL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  const [selected, setSelected] = useState<string[]>(storeL2Ids);
  const categories = useVisibleCategories();

  const options = useMemo<PickerOption[]>(
    () =>
      (categories.data ?? []).map((category) => {
        const Icon = getCategoryIcon(category.icon);
        const active = selected.includes(category.id);
        return {
          id: category.id,
          title: category.name_ru,
          icon: <Icon size={18} weight="bold" color={active ? tc.accent : tc.mute} />,
        };
      }),
    [categories.data, selected, tc.accent, tc.mute],
  );

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
        options={options}
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
