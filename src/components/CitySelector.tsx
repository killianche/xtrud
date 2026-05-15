/**
 * CitySelector — chip-кнопка «Город ▾» + PickerSheet со списком городов.
 *
 * Источник данных: `MAJOR_CITIES` из `@/lib/location-config` (8 поселений).
 * Глобальное состояние пользовательского города — `useUserCity` из
 * `@/lib/use-user-city` (Zustand + persist + init-цикл AsyncStorage → geo →
 * nearest → DEFAULT_CITY).
 *
 * Использование:
 *   <CitySelector />   // chip с текущим городом, тап открывает PickerSheet
 *
 * Сёла — не показываются в этом селекторе (он про «город пользователя»,
 * один уровень). Для иерархического выбора заказа — <LocationPicker> в
 * `src/features/orders/LocationPicker.tsx`.
 */

import { ChevronDown, MapPin } from "lucide-react-native";
import { useState } from "react";
import { Chip, PickerSheet, type PickerOption } from "@/components/ui";
import { ALL_INGUSHETIA_CITY_ID, PICKER_CITIES } from "@/lib/location-config";
import { useThemeColors } from "@/lib/use-theme-color";
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
  const tc = useThemeColors(["ink", "mute"]);

  return (
    <>
      <Chip
        variant="outline"
        size="md"
        onPress={() => setOpen(true)}
        leftIcon={<MapPin size={14} strokeWidth={1.75} color={tc.mute} />}
        rightIcon={<ChevronDown size={14} strokeWidth={1.75} color={tc.mute} />}
      >
        {cityName}
      </Chip>

      <PickerSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Город"
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
