/**
 * CitySelector — header-pill «Город ▾» + PickerSheet со списком городов.
 *
 * **Визуал** идентичен `ScreenHeader.rightAction` (UI_PATTERNS §3.1):
 * h-11 rounded-pill border-hairline bg-canvas px-4, иконка 16 ink,
 * текст text-button semibold. Это единый стандарт для всех right-actions
 * в хедерах xtrud (фидбэк user 2026-05-15 «кнопка локации мелкая и кривая»).
 *
 * Источник данных: `MAJOR_CITIES` из `@/lib/location-config` (8 поселений).
 * Глобальное состояние пользовательского города — `useUserCity` из
 * `@/lib/use-user-city` (Zustand + persist + init-цикл AsyncStorage → geo →
 * nearest → DEFAULT_CITY).
 *
 * Использование:
 *   <CitySelector />   // pill с текущим городом, тап открывает PickerSheet
 *
 * Сёла — не показываются в этом селекторе (он про «город пользователя»,
 * один уровень). Для иерархического выбора заказа — <LocationPicker> в
 * `src/features/orders/LocationPicker.tsx`.
 */

import { ChevronDown, MapPin } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { PickerSheet, type PickerOption } from "@/components/ui";
import { ALL_INGUSHETIA_CITY_ID, PICKER_CITIES } from "@/lib/location-config";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";
import { useUserCity } from "@/lib/use-user-city";

/**
 * Опции для PickerSheet: «Вся Ингушетия» первой, потом города из
 * PICKER_CITIES (без раздельных Назрань/Магас — есть только объединённый
 * `nazran-magas`, см. location-config.ts § hiddenInPicker).
 */
export const CITIES = [
  { id: ALL_INGUSHETIA_CITY_ID, name: "Ингушетия" },
  ...PICKER_CITIES,
] as const;

/** @deprecated — используйте `string` напрямую (cityId — text PK в БД). */
export type CityId = (typeof CITIES)[number]["id"];

// Re-export для обратной совместимости. Новый код — импорт напрямую из @/lib/use-user-city.
export { useCityStore, getCityName } from "@/lib/use-user-city";

export function CitySelector() {
  const { cityId, cityName, setCity } = useUserCity();
  const [open, setOpen] = useState(false);
  const inkColor = useThemeColor("ink");
  const tc = useThemeColors(["ink"]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Город: ${cityName}`}
        onPress={() => setOpen(true)}
        className="h-11 flex-row items-center gap-1.5 rounded-pill border px-4 active:opacity-70 border-hairline bg-canvas hover:bg-surface-2"
      >
        <MapPin size={16} strokeWidth={2} color={inkColor} />
        <AppText weight="semibold" className="text-button text-ink" numberOfLines={1}>
          {cityName}
        </AppText>
        <View className="-mr-1">
          <ChevronDown size={16} strokeWidth={2} color={inkColor} />
        </View>
      </Pressable>

      <PickerSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Город"
        // Search убран по фидбеку user 2026-05-15: всего 8 населённых пунктов
        // Ингушетии помещаются на экране без скролла, search-input избыточен.
        searchable={false}
        options={CITIES.map<PickerOption>((c) => ({
          id: c.id,
          title: c.name,
          icon: <MapPin size={18} strokeWidth={1.75} color={tc.ink} />,
        }))}
        selectedId={cityId}
        onSelect={(id) => {
          setCity(id);
          setOpen(false);
        }}
      />
    </>
  );
}
