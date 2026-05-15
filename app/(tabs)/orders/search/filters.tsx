// /orders/search/filters — full-screen экран фильтров для глобального поиска заказов.
//
// Эталон UX (фидбек user 2026-05-15 + референс-скриншоты):
//   - Полный экран (не expandable inline) — больше места, удобнее на mobile.
//   - Header через <ScreenHeader> (back + title display-md + опц. action).
//   - Категория НЕ перечислена сразу — кнопка-trigger «Выберите категории»
//     с chevron, при тапе → full-screen picker (переиспользует /orders/category-select).
//   - Сортировка через крупные pill chips.
//   - Sticky footer с большой primary-кнопкой «Применить» + ссылкой «Сбросить».
//
// State через Zustand (orders-search-filters-store) — переживает переход
// на category-select и обратно.

import { useFocusEffect, useRouter } from "expo-router";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, ScreenHeader } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

export default function OrdersSearchFiltersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useSafeBack("/(tabs)/orders/search" as const);
  const muteColor = useThemeColor("mute");
  const inkColor = useThemeColor("ink");

  // Скрываем TabBar — full-screen фильтры.
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );

  const filters = useOrdersSearchFiltersStore();
  const { l2Ids, l1Id, sort, setL1Id, setSort, clearAll } = filters;

  const { data: l1List } = useCategoriesL1();
  const { data: l2List } = useVisibleCategories();

  // Показываем имена выбранных L2 в trigger (первые 2 + «и ещё N»).
  const selectedL2Names = useMemo(() => {
    if (!l2List || l2Ids.length === 0) return null;
    const names = l2Ids
      .map((id) => l2List.find((c) => c.id === id)?.name_ru)
      .filter((x): x is string => !!x);
    if (names.length === 0) return null;
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} и ещё ${names.length - 2}`;
  }, [l2List, l2Ids]);

  const activeCount = countActiveFilters(filters);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Фильтры" onBack={goBack} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* СОРТИРОВКА */}
        <View className="px-5 pt-4">
          <AppText weight="semibold" className="text-body-md text-ink">
            Сортировка
          </AppText>
          <View className="mt-3 flex-row gap-2">
            <SortChip
              label="Новые сверху"
              selected={sort === "newest"}
              onPress={() => setSort("newest")}
            />
            <SortChip
              label="Срочные сверху"
              selected={sort === "urgent"}
              onPress={() => setSort("urgent")}
            />
          </View>
        </View>

        {/* КАТЕГОРИЯ — кнопка-trigger в picker */}
        <View className="mt-8 px-5">
          <AppText weight="semibold" className="text-body-md text-ink">
            Категория
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Выбрать категории"
            onPress={() =>
              router.push("/(tabs)/orders/search/category-select" as never)
            }
            className="mt-3 flex-row items-center gap-3 rounded-md border border-hairline bg-canvas px-4 h-14 active:opacity-70"
          >
            <View className="flex-1">
              {selectedL2Names ? (
                <>
                  <AppText className="text-caption text-muted">
                    Выбрано {l2Ids.length}
                  </AppText>
                  <AppText
                    weight="medium"
                    className="text-body-md text-ink mt-0.5"
                    numberOfLines={1}
                  >
                    {selectedL2Names}
                  </AppText>
                </>
              ) : (
                <AppText className="text-body-md text-mute">
                  Выберите категории
                </AppText>
              )}
            </View>
            <ChevronDown size={20} strokeWidth={1.75} color={muteColor} />
          </Pressable>
        </View>

        {/* РАЗДЕЛ L1 (drill-down) — chips */}
        <View className="mt-8 px-5">
          <AppText weight="semibold" className="text-body-md text-ink">
            Раздел
          </AppText>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <SortChip
              label="Все разделы"
              selected={l1Id == null}
              onPress={() => setL1Id(null)}
            />
            {(l1List ?? []).map((l1) => (
              <SortChip
                key={l1.id}
                label={l1.name_ru}
                selected={l1Id === l1.id}
                onPress={() => setL1Id(l1Id === l1.id ? null : l1.id)}
              />
            ))}
          </View>
        </View>

        {/* RESET-ссылка */}
        {activeCount > 0 ? (
          <View className="mt-8 px-5">
            <Pressable
              accessibilityRole="button"
              onPress={clearAll}
              className="self-start active:opacity-70"
              hitSlop={8}
            >
              <AppText weight="medium" className="text-body-md text-link">
                Сбросить все фильтры
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky footer с primary-кнопкой */}
      <View
        className="border-hairline-soft border-t bg-canvas px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button variant="primary" size="lg" fullWidth onPress={goBack}>
          {activeCount > 0 ? `Применить · ${activeCount}` : "Применить"}
        </Button>
      </View>
    </View>
  );
}

interface SortChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function SortChip({ label, selected, onPress }: SortChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-11 items-center justify-center rounded-pill border px-4 active:opacity-70 ${
        selected
          ? "border-ink bg-ink"
          : "border-hairline bg-canvas hover:bg-surface-2"
      }`}
    >
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-body-sm ${selected ? "text-on-primary" : "text-ink"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
