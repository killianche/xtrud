/**
 * /find/filters — фильтры ленты заданий: категория и место
 * (docs/FIND_SCREEN_REDESIGN.md §3.3). Обычный экран с «назад», а не шторка
 * и не закреплённая шапка: заходят сюда редко, а место на экране ленты он
 * больше не занимает.
 *
 * Сам выбор — прежние шторки /find/category-select и /find/location-select:
 * они применяют значение сразу и закрываются, поэтому кнопки «Применить» нет.
 */

import { useRouter } from "expo-router";
import { MapPin, SquaresFour } from "phosphor-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InsetGroup, InsetRow, ScreenHeader } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { filtersSummary } from "@/features/orders/find/filters-summary";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { hapticSelection } from "@/lib/haptics";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindFiltersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useSafeBack("/(tabs)/find" as const);
  const tc = useThemeColors(["ink"]);

  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const clearAll = useOrdersSearchFiltersStore((s) => s.clearAll);

  const categories = useVisibleCategories();
  const l1 = useCategoriesL1();
  const cities = useCities();

  const categoryValue = useMemo(
    () =>
      filtersSummary({
        l2Ids,
        cityId: "",
        district: "",
        categories: categories.data ?? [],
        sections: l1.data ?? [],
      }) ?? "Все категории",
    [l2Ids, categories.data, l1.data],
  );
  const locationValue = cityId
    ? (cities.data?.find((c) => c.id === cityId)?.name ?? "Город")
    : district || "Вся Ингушетия";
  const hasActive = l2Ids.length > 0 || !!cityId || !!district;

  return (
    <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title="Фильтры"
        onBack={goBack}
        rightAction={
          hasActive
            ? {
                label: "Сбросить",
                onPress: () => {
                  hapticSelection();
                  clearAll();
                },
              }
            : undefined
        }
      />
      <View className="pt-2">
        <InsetGroup>
          <InsetRow
            title="Категория"
            value={categoryValue}
            icon={<SquaresFour size={18} weight="bold" color={tc.ink} />}
            navigates
            onPress={() => router.push("/find/category-select" as never)}
          />
          <InsetRow
            title="Место"
            value={locationValue}
            icon={<MapPin size={18} weight="bold" color={tc.ink} />}
            navigates
            onPress={() => router.push("/find/location-select" as never)}
            last
          />
        </InsetGroup>
      </View>
    </View>
  );
}
