// /orders/search/location-select — full-screen выбор локации для фильтра поиска
// заказов. Открывается кнопкой-триггером с экрана /orders/search/filters.
//
// Зачем отдельная страница (фидбэк владельца 2026-05-24): на экране фильтра
// «Категория» открывается отдельной полной страницей (category-select), а
// «Локация» раньше была инлайн (Вся Ингушетия + города + районы сразу). Владелец:
// «сделай локацию точно так же — кнопкой, тапнул → открылись все варианты →
// выбрал». Поэтому контент локации перенесён сюда 1-в-1 (тот же набор: Вся
// Ингушетия / город / район, без сёл — как было в фильтре), а на /filters
// остаётся компактный триггер.
//
// Handshake (как у /orders/search/category-select): пишем ПРЯМО в общий Zustand
// `useOrdersSearchFiltersStore` (он переживает навигацию). Выбор применяется
// сразу; кнопка «Готово» и back из header просто возвращают на фильтры.
//
// Модель локации фильтра (НЕ трогалась при переносе):
//   - cityId / district взаимоисключающие;
//   - «Вся Ингушетия» = setLocation("", "") — фильтр локации снят;
//   - повторный тап по городу/району снимает его.

import { Check, MapPin } from "phosphor-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, ScreenHeader } from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCities } from "@/features/cities/use-cities";
import { districtOptions } from "@/features/orders/order-schema";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

/** Единый стиль chip-кнопки (город / район) — совпадает с SortChip на /filters
 *  (h-11, rounded-pill, accent-soft selected, hairline default). */
const chipClass = (selected: boolean) =>
  `h-11 items-center justify-center rounded-pill border px-4 active:opacity-70 ${
    selected ? "border-ink bg-ink" : "border-hairline bg-canvas hover:bg-surface-2"
  }`;
const chipTextClass = (selected: boolean) =>
  `text-body-sm ${selected ? "text-on-primary" : "text-ink"}`;

export default function OrdersSearchLocationSelectScreen() {
  const insets = useSafeAreaInsets();
  const goBack = useSafeBack("/orders/search/filters" as const);
  const tc = useThemeColors(["ink", "accent"]);

  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);

  const { data: cities } = useCities();
  // «Вся Ингушетия» = локация-фильтр снят (ни город, ни район не выбраны).
  const isAllLoc = !cityId && !district;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Локация" onBack={goBack} />

      <ScrollView
        className="mt-2 flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="px-5 pt-2">
          {/* Вся Ингушетия — снимает фильтр локации (показать все районы). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Вся Ингушетия"
            accessibilityState={{ selected: isAllLoc }}
            onPress={() => setLocation("", "")}
            className={`flex-row items-center gap-3 rounded-lg border p-3.5 ${
              isAllLoc
                ? "border-accent bg-accent-soft"
                : "border-hairline bg-canvas-soft active:opacity-70"
            }`}
          >
            <View className="h-10 w-10 items-center justify-center rounded-md bg-canvas">
              <MapPin
                size={20}
                weight={isAllLoc ? "fill" : "bold"}
                color={isAllLoc ? tc.accent : tc.ink}
              />
            </View>
            <AppText
              weight="semibold"
              className={`flex-1 text-body-md ${isAllLoc ? "text-accent" : "text-ink"}`}
            >
              Вся Ингушетия
            </AppText>
            {isAllLoc ? <Check size={20} weight="fill" color={tc.accent} /> : null}
          </Pressable>

          {/* Город — выбор сбрасывает район; повторный тап снимает. */}
          <AppText
            weight="semibold"
            className="mt-8 text-caption uppercase tracking-wider text-muted"
          >
            Город
          </AppText>
          {cities === undefined ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {[72, 92, 80, 88, 104, 76].map((w) => (
                <Skeleton key={w} width={w} height={44} className="rounded-pill" />
              ))}
            </View>
          ) : (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {cities.map((c) => {
                const selected = cityId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setLocation(selected ? "" : c.id, "")}
                    className={chipClass(selected)}
                  >
                    <AppText weight="medium" className={chipTextClass(selected)}>
                      {c.name}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Район — выбор сбрасывает город; повторный тап снимает. */}
          <AppText
            weight="semibold"
            className="mt-8 text-caption uppercase tracking-wider text-muted"
          >
            Район
          </AppText>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {districtOptions.map((d) => {
              const selected = district === d;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setLocation("", selected ? "" : d)}
                  className={chipClass(selected)}
                >
                  <AppText weight="medium" className={chipTextClass(selected)}>
                    {d}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Sticky footer — выбор уже применён в store, кнопка просто возвращает. */}
      <View
        className="border-t border-hairline px-5 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button variant="primary" size="lg" fullWidth onPress={goBack}>
          Готово
        </Button>
      </View>
    </View>
  );
}
