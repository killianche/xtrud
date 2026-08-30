// /orders/search/category-select — full-screen multi-select picker категорий
// для фильтров глобального поиска заказов (/orders/search/filters).
//
// Отличие от /orders/category-select (wizard-flow):
//   - **Multi-select** (Set), не single-pick.
//   - Тап по строке → toggle (✓), а не сразу navigate back.
//   - Sticky footer с primary-кнопкой «Применить · N» (или «Сбросить»
//     если ничего не выбрано).
//   - Пишет в useOrdersSearchFiltersStore.setL2Ids(), не в order-draft.
//
// UX-стандарты (фидбек user 2026-05-15):
//   - <ScreenHeader title="Категории" onBack={...} /> (height 64).
//   - MagnifyingGlass input крупный (h-14, 18px шрифт).
//   - Lucide Check 20 для отметки выбранного, цветные Iconify-иконки
//     слева (как в wizard category-select).
//   - Sticky footer с большой Button size="lg".

import { useFocusEffect } from "expo-router";
import { Check, MagnifyingGlass, Sparkle, X } from "phosphor-react-native";
import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, ScreenHeader } from "@/components/ui";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { highlightMatch } from "@/lib/highlight-match";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

export default function FiltersCategorySelectScreen() {
  const insets = useSafeAreaInsets();
  const inkColor = useThemeColor("ink");
  const muteColor = useThemeColor("mute");
  const onDarkColor = useThemeColor("on-dark");
  const goBack = useSafeBack("/orders/search/filters" as const);

  // Скрываем TabBar — это full-screen detail-экран фильтров.
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );

  const [query, setQuery] = useState("");

  // Multi-select state — локальная Set, синхронизируется со стором при apply.
  // Инициализируем из стора (чтобы при reopen уже выбранные были отмечены).
  const storeL2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const setStoreL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(storeL2Ids));

  const { data: categories = [] } = useVisibleCategories();
  const search = useSearchCategories(query, 20);

  type Row = {
    rowKey: string;
    l2_id: string;
    name_ru: string;
    parentName: string | null;
    icon: string | null;
    isL3: boolean;
  };

  const browseRows: Row[] = useMemo(
    () =>
      categories.map((cat) => ({
        rowKey: `l2:${cat.id}`,
        l2_id: cat.id,
        name_ru: cat.name_ru,
        parentName: null,
        icon: cat.icon,
        isL3: false,
      })),
    [categories],
  );

  const searchRows: Row[] = useMemo(() => {
    if (!search.data) return [];
    const l2NameById = new Map(categories.map((c) => [c.id, c.name_ru]));
    return search.data.hits.map((hit) => ({
      rowKey: `${hit.kind}:${hit.id}`,
      l2_id: hit.l2_id,
      name_ru: hit.name_ru,
      parentName: hit.kind === "l3" ? (l2NameById.get(hit.l2_id) ?? null) : null,
      icon: categories.find((c) => c.id === hit.l2_id)?.icon ?? null,
      isL3: hit.kind === "l3",
    }));
  }, [search.data, categories]);

  const isSearching = query.trim().length >= 2;
  const rows = isSearching ? searchRows : browseRows;

  const toggle = (l2Id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(l2Id)) next.delete(l2Id);
      else next.add(l2Id);
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const apply = () => {
    setStoreL2Ids(Array.from(selected));
    goBack();
  };

  const count = selected.size;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title="Категории"
        onBack={goBack}
        rightAction={
          count > 0
            ? {
                label: "Сбросить",
                onPress: clearAll,
              }
            : undefined
        }
      />

      {/* Typeahead инпут — крупный (h-14, 18px). */}
      <View className="px-5 mt-2">
        <View className="flex-row items-center gap-3 min-h-14 rounded-2xl bg-canvas-soft px-4">
          <MagnifyingGlass size={20} weight="bold" color={muteColor} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти категорию"
            placeholderTextColor={muteColor}
            className="flex-1 text-ink"
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              fontSize: 18,
              fontWeight: "500",
              paddingVertical: 0,
            }}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              onPress={() => setQuery("")}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <X size={18} weight="bold" color={muteColor} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Раскладка-fix баннер */}
      {isSearching && search.data?.wasFlipped && search.data.flippedQuery ? (
        <View className="px-5 mt-3">
          <View className="flex-row items-center gap-2 rounded-md bg-canvas-soft px-3 py-2">
            <Sparkle size={14} weight="bold" color={inkColor} />
            <AppText className="text-caption text-body" numberOfLines={1}>
              Возможно, вы искали:{" "}
              <AppText weight="semibold" className="text-ink">
                {search.data.flippedQuery}
              </AppText>
            </AppText>
          </View>
        </View>
      ) : null}

      <ScrollView
        className="mt-3 flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {isSearching && search.isLoading ? (
          <View className="px-5 py-4">
            <AppText className="text-body-sm text-mute">Ищем…</AppText>
          </View>
        ) : rows.length === 0 ? (
          <View className="px-5 py-8 items-center">
            <AppText className="text-body-sm text-mute text-center">
              {isSearching
                ? `Ничего не нашли по запросу «${query}». Попробуйте другое слово.`
                : "Категорий пока нет."}
            </AppText>
          </View>
        ) : (
          rows.map((row) => {
            const colorUrl = getCategoryColorIconUrl(row.l2_id);
            const Icon = getCategoryIcon(row.icon);
            const segments = isSearching ? highlightMatch(row.name_ru, query) : null;
            const isSelected = selected.has(row.l2_id);
            return (
              <Pressable
                key={row.rowKey}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={row.name_ru}
                onPress={() => toggle(row.l2_id)}
                className="flex-row items-center gap-3 px-5 py-3 active:bg-canvas-soft-2"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft shrink-0">
                  {colorUrl ? (
                    <Image source={{ uri: colorUrl }} style={{ width: 24, height: 24 }} />
                  ) : (
                    <Icon size={20} weight="bold" color={inkColor} />
                  )}
                </View>
                <View className="flex-1">
                  <AppText className="text-body-md text-ink" numberOfLines={1}>
                    {segments
                      ? segments.map((seg, idx) => (
                          <AppText
                            // biome-ignore lint/suspicious/noArrayIndexKey: stable segment index
                            key={idx}
                            weight={seg.match ? "semibold" : "regular"}
                            className={seg.match ? "text-ink" : "text-body"}
                          >
                            {seg.text}
                          </AppText>
                        ))
                      : row.name_ru}
                  </AppText>
                  {row.isL3 && row.parentName ? (
                    <AppText className="mt-0.5 text-caption text-mute" numberOfLines={1}>
                      в категории «{row.parentName}»
                    </AppText>
                  ) : null}
                </View>
                {/* Checkbox-индикатор справа — солидный accent (iOS-style)
                    когда выбран. Чёрные индикаторы запрещены (user 2026-05-15). */}
                <View
                  className={`h-7 w-7 items-center justify-center rounded-full border ${
                    isSelected ? "border-accent bg-accent" : "border-hairline bg-canvas"
                  }`}
                >
                  {isSelected ? <Check size={16} weight="bold" color={onDarkColor} /> : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Sticky footer с primary-кнопкой */}
      <View
        className="border-hairline-soft border-t bg-canvas px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button variant="primary" size="lg" fullWidth onPress={apply}>
          {count > 0 ? `Применить · ${count}` : "Применить"}
        </Button>
      </View>
    </View>
  );
}
