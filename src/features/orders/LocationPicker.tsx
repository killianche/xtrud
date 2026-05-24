/**
 * LocationPicker — компактный триггер выбора локации заказа.
 *
 *   ┌────────────────────────────────────────┐
 *   │ 📍 Магас · Назрановский …            ›  │   ← compact trigger
 *   └────────────────────────────────────────┘
 *
 * При тапе открывается ПОЛНОЦЕННАЯ страница `/orders/location-select`
 * (ScreenHeader + чипы город/район/село + «Готово»). После «Готово»
 * выбор возвращается через Zustand-store `useOrderDraftStore.selectedLocation`,
 * который этот компонент слушает через useEffect и применяет в react-hook-form
 * (cityId + district).
 *
 * ── Редизайн 2026-05-24 ──────────────────────────────────────────────────
 * Раньше выбор локации жил в bottom-sheet (`BottomSheet`), а выбор категории —
 * в отдельном route. Два разных механизма = разный стиль окна. По фидбэку
 * владельца оба унифицированы как отдельные route-экраны (см.
 * `app/(tabs)/orders/location-select.tsx`). Bottom-sheet на web давал
 * визуальные артефакты — поэтому «оба как страницы». Сам триггер приведён
 * к единому виду с `CategoryPicker` (h-14, rounded-lg, leading-иконка +
 * label + CaretRight «открыть страницу»).
 *
 * Public-props не менялись (cityId, district, cities, onChange, disabled,
 * error) — `OrderFormBody` и edit-экран используют компонент как прежде.
 *
 * Pre-fill: cityId="all" → «Вся Ингушетия». district = имя села → активный
 * район восстанавливается на странице через findDistrictByVillage.
 */

import { useRouter } from "expo-router";
import { CaretRight, MapPin } from "phosphor-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { ALL_INGUSHETIA_CITY } from "@/features/orders/order-schema";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { useThemeColors } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

type City = Pick<Tables<"cities">, "id" | "name">;

export interface LocationPickerProps {
  /** Текущий cityId — "" если не выбран, "all" для «Вся Ингушетия», иначе id. */
  cityId: string;
  /** Текущий district — "" если не выбран, имя района или села. */
  district: string;
  /** Список городов из БД. Может быть undefined пока грузится. */
  cities: readonly City[] | undefined;
  /** Commit изменений (после «Готово» на странице выбора). */
  onChange: (next: { cityId: string; district: string }) => void;
  disabled?: boolean;
  error?: string;
}

export function LocationPicker({
  cityId,
  district,
  cities,
  onChange,
  disabled,
  error,
}: LocationPickerProps) {
  const router = useRouter();
  const tc = useThemeColors(["ink", "mute"]);

  // Слушаем store — когда пользователь нажал «Готово» на /orders/location-select,
  // store.selectedLocation устанавливается → применяем в react-hook-form и
  // обнуляем флаг, чтобы следующий цикл не сработал повторно.
  const selectedLocation = useOrderDraftStore((s) => s.selectedLocation);
  const setSelectedLocation = useOrderDraftStore((s) => s.setSelectedLocation);

  useEffect(() => {
    if (!selectedLocation) return;
    const changed =
      selectedLocation.cityId !== cityId || selectedLocation.district !== district;
    if (changed) {
      onChange({ cityId: selectedLocation.cityId, district: selectedLocation.district });
    }
    setSelectedLocation(null);
  }, [selectedLocation, cityId, district, onChange, setSelectedLocation]);

  // Trigger-label: composed из cityId + district.
  const cityName =
    cityId === ALL_INGUSHETIA_CITY
      ? "Вся Ингушетия"
      : (cities?.find((c) => c.id === cityId)?.name ?? null);
  const triggerParts = [cityName, district].filter((s): s is string => !!s);
  const triggerLabel =
    triggerParts.length === 0 ? "Выберите локацию" : triggerParts.join(" · ");
  const isPlaceholder = triggerParts.length === 0;

  return (
    <View>
      {/* Trigger — единый form-input стандарт с CategoryPicker (h-14, rounded-lg,
          bg-canvas, leading-иконка + label + CaretRight). CaretRight (а не
          CaretDown) — visual-signal, что тап открывает отдельную страницу. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Выбрать локацию"
        disabled={disabled}
        onPress={() =>
          router.push({
            pathname: "/(tabs)/orders/location-select",
            params: { cityId, district },
          } as never)
        }
        className={`mt-2 h-14 flex-row items-center gap-3 rounded-lg border bg-canvas px-4 active:opacity-70 ${
          error ? "border-error" : "border-hairline"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <MapPin size={20} weight="bold" color={isPlaceholder ? tc.mute : tc.ink} />
        <AppText
          className={`flex-1 text-body-md ${isPlaceholder ? "text-mute" : "text-ink"}`}
          numberOfLines={1}
        >
          {triggerLabel}
        </AppText>
        <CaretRight size={18} weight="bold" color={tc.mute} />
      </Pressable>

      {error ? (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
