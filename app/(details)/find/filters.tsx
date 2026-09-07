/**
 * /find/filters — все фильтры ленты «Задания» в одной системной шторке.
 *
 * Открывается круглой кнопкой напротив заголовка «Задания» (DECISION владельца
 * 2026-09-07: «убрать чипы, одна большая кнопка фильтров справа от заголовка,
 * как у Apple»). Внутри — inset-группа строк «Категория» и «Место» со
 * значением и шевроном: тап открывает системную шторку выбора поверх этой
 * (как вложенные листы в Картах и App Store), «Сбросить» снимает всё,
 * «Показать задания» закрывает шторку. Значения применяются к ленте сразу —
 * стор общий, отдельного «Применить» нет.
 */

import { Stack, useRouter } from "expo-router";
import { MapPin, SquaresFour, XCircle } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { GlassButton, InsetGroup, InsetRow, SystemIcon } from "@/components/ui";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useOrdersFilterLabels } from "@/features/orders/use-orders-filter-labels";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

// Константа модуля: новый объект на каждый рендер переоткрывает шторку.
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
};

export default function OrdersSearchFiltersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "mute", "on-accent"]);
  const filters = useOrdersSearchFiltersStore();
  const labels = useOrdersFilterLabels();
  const activeCount = countActiveFilters(filters);

  const close = () => router.back();

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <View className="w-full bg-surface-page" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-start gap-3 px-4 pt-4 pb-2">
          <View className="min-w-0 flex-1 pt-0.5">
            <AppText weight="bold" className="text-ios-title1 text-ink" numberOfLines={1}>
              Фильтры
            </AppText>
            <AppText className="mt-0.5 text-ios-subheadline text-mute" numberOfLines={1}>
              {activeCount > 0 ? `Выбрано: ${activeCount}` : "Показываем все задания"}
            </AppText>
          </View>
          {activeCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сбросить фильтры"
              onPress={() => {
                hapticSelection();
                filters.clearAll();
              }}
              hitSlop={8}
              className="min-h-8 justify-center px-1 active:opacity-60"
            >
              <AppText className="text-ios-body text-accent">Сбросить</AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={close}
            hitSlop={10}
            className="h-8 w-8 items-center justify-center active:opacity-60"
          >
            <SystemIcon
              sf="xmark.circle.fill"
              fallback={XCircle}
              size={30}
              weight="regular"
              hierarchical
              color={tc.mute}
            />
          </Pressable>
        </View>

        <View className="pt-2">
          <InsetGroup>
            <InsetRow
              title="Категория"
              value={labels.category}
              icon={
                <SquaresFour
                  size={18}
                  weight="bold"
                  color={labels.categoryActive ? tc["on-accent"] : tc.ink}
                />
              }
              iconAccent={labels.categoryActive}
              navigates
              onPress={() => router.push("/find/category-select" as never)}
            />
            <InsetRow
              title="Место"
              value={labels.location}
              icon={
                <MapPin
                  size={18}
                  weight="bold"
                  color={labels.locationActive ? tc["on-accent"] : tc.ink}
                />
              }
              iconAccent={labels.locationActive}
              navigates
              onPress={() => router.push("/find/location-select" as never)}
              last
            />
          </InsetGroup>
        </View>

        <View className="px-4 pt-4" style={{ paddingBottom: insets.bottom + 12 }}>
          <GlassButton label="Показать задания" onPress={close} />
        </View>
      </View>
    </>
  );
}
