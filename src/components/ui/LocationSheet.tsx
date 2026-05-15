/**
 * LocationSheet — multi-select городов и районов в одном bottom-sheet'е.
 *
 * Подход скопирован из Ingush-Business `components/LocationSheet.tsx`:
 * клиент / мастер может выбрать несколько городов И несколько районов
 * одновременно. Тип состояния — `LocationFilter` ({isAll, cities[], districts[]}).
 *
 * **Когда использовать:**
 *   - Фильтр master-feed по нескольким локациям («Назрань, Магас, Сунженский»)
 *   - Master service zone — где мастер работает (≥1 город)
 *   - Любой multi-select по локациям с двумя уровнями
 *
 * **Когда НЕ использовать:**
 *   - Один город — используй <CitySelector> + <PickerSheet>
 *   - Иерархическая локация с сёлами для одного заказа — используй <LocationPicker>
 *   - Сёла напрямую — используй <LocationFilterSheet> с Set-API
 *
 * **API:**
 *   <LocationSheet
 *     open={visible}
 *     onClose={...}
 *     value={filter}                  // LocationFilter
 *     onApply={(next) => setFilter(next)}
 *   />
 *
 *   const label = getLocationLabel(filter);  // для trigger pill
 */

import { Check, MapPin } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet, Button } from "@/components/ui";
import {
  DISTRICTS,
  EMPTY_LOCATION_FILTER,
  type LocationFilter,
  PICKER_CITIES,
} from "@/lib/location-config";
import { useThemeColors } from "@/lib/use-theme-color";

export interface LocationSheetProps {
  open: boolean;
  onClose: () => void;
  value: LocationFilter;
  /** Commit изменений (тап «Применить»). Передаётся новый объект. */
  onApply: (next: LocationFilter) => void;
  /** Заголовок sheet'а. По умолчанию «Где искать». */
  title?: string;
  /** Subtitle под заголовком. */
  subtitle?: string;
}

export function LocationSheet({
  open,
  onClose,
  value,
  onApply,
  title = "Где искать",
  subtitle = "Выберите города и районы — можно несколько",
}: LocationSheetProps) {
  const tc = useThemeColors(["ink", "mute", "accent"]);

  // Draft state — commit только на «Применить».
  const [draft, setDraft] = useState<LocationFilter>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const isAll = draft.isAll || (draft.cities.length === 0 && draft.districts.length === 0);

  function toggleAll() {
    setDraft({ isAll: true, cities: [], districts: [] });
  }

  function toggleCity(cityId: string) {
    setDraft((d) => {
      const next = d.cities.includes(cityId)
        ? d.cities.filter((c) => c !== cityId)
        : [...d.cities, cityId];
      return { isAll: false, cities: next, districts: d.districts };
    });
  }

  function toggleDistrict(districtName: string) {
    setDraft((d) => {
      const next = d.districts.includes(districtName)
        ? d.districts.filter((x) => x !== districtName)
        : [...d.districts, districtName];
      return { isAll: false, cities: d.cities, districts: next };
    });
  }

  function reset() {
    setDraft(EMPTY_LOCATION_FILTER);
  }

  function apply() {
    onApply(draft);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title} subtitle={subtitle} fullScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* «Вся Ингушетия» card — снимает все остальные фильтры */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Вся Ингушетия"
          accessibilityState={{ selected: isAll }}
          onPress={toggleAll}
          className={`flex-row items-center gap-3 rounded-lg border p-4 ${
            isAll ? "border-accent bg-accent-soft" : "border-hairline bg-canvas-soft active:opacity-70"
          }`}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas">
            <MapPin size={18} weight="bold" color={tc.ink} />
          </View>
          <View className="flex-1">
            <AppText
              weight="semibold"
              className={`text-body-md ${isAll ? "text-accent" : "text-ink"}`}
            >
              Вся Ингушетия
            </AppText>
            <AppText className="mt-0.5 text-caption text-mute">
              Без фильтра по городу или району
            </AppText>
          </View>
          {isAll ? <Check size={20} weight="fill" color={tc.accent} /> : null}
        </Pressable>

        {/* Города */}
        <AppText weight="semibold" className="mt-6 text-body-sm text-ink">
          Города
        </AppText>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {PICKER_CITIES.map((c) => {
            const selected = !isAll && draft.cities.includes(c.id);
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleCity(c.id)}
                className={`h-10 items-center justify-center rounded-pill border px-4 ${
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-hairline bg-canvas active:opacity-70"
                }`}
              >
                <AppText
                  weight="medium"
                  className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
                >
                  {c.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Районы */}
        <AppText weight="semibold" className="mt-6 text-body-sm text-ink">
          Районы
        </AppText>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {DISTRICTS.map((d) => {
            const selected = !isAll && draft.districts.includes(d.name);
            return (
              <Pressable
                key={d.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleDistrict(d.name)}
                className={`h-10 items-center justify-center rounded-pill border px-4 ${
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-hairline bg-canvas active:opacity-70"
                }`}
              >
                <AppText
                  weight="medium"
                  className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
                >
                  {d.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Reset link — небольшая ссылка снизу */}
        {!isAll ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сбросить"
            onPress={reset}
            hitSlop={8}
            className="mt-6 self-start active:opacity-60"
          >
            <AppText weight="medium" className="text-body-sm text-link">
              Сбросить фильтр
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>

      <View className="border-t border-hairline pt-4">
        <Button variant="primary" size="lg" fullWidth onPress={apply}>
          Применить
        </Button>
      </View>
    </BottomSheet>
  );
}
