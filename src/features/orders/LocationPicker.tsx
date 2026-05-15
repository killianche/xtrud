/**
 * LocationPicker — иерархический выбор локации заказа.
 *
 * Структура (скопирована из Ingush-Business `LocationSheet`, адаптирована
 * под нашу Vercel-эстетику и DESIGN.md):
 *
 *   ┌───────────────────────────────────────┐
 *   │ Trigger: 📍 [Магас · Назрановский …] ▾│
 *   └───────────────────────────────────────┘
 *               ↓ тап → открыть sheet
 *   ┌───────────────────────────────────────┐
 *   │ ← Где находится задача                │
 *   │   Выберите город. Район — по желанию. │
 *   │                                        │
 *   │   ▢ Вся Ингушетия — заказ увидят      │
 *   │     мастера со всей республики        │
 *   │                                        │
 *   │   Или выберите город                  │
 *   │   ● Магас ○ Назрань ○ Сунжа …         │
 *   │                                        │
 *   │   Район (необязательно)               │
 *   │   ● Назрановский ○ Сунженский …       │
 *   │                                        │
 *   │   Уточнить село                       │
 *   │   ● Экажево ○ Яндаре ○ Плиево …       │
 *   │                                        │
 *   │   [        Готово        ]            │
 *   └───────────────────────────────────────┘
 *
 * Управление form-state: draft-state локально внутри sheet'а, commit
 * через `onChange({cityId, district})` только при тапе «Готово». Тап
 * вне sheet или back-button = отмена изменений (state восстанавливается
 * из props при следующем open).
 *
 * Используется в:
 *   - `app/(tabs)/orders/new.tsx` через `OrderFormBody`
 *   - `app/(tabs)/orders/edit/[id].tsx` через тот же `OrderFormBody`
 *
 * Pre-fill: если приходит cityId="all" → toggle «Вся Ингушетия» on.
 * Если district = имя села → активный район восстанавливается через
 * `findDistrictByVillage`, оба chip'а подсвечиваются.
 */

import { Check, ChevronDown, MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet, Button } from "@/components/ui";
import {
  ALL_INGUSHETIA_CITY,
  districtOptions,
  findDistrictByVillage,
  isDistrict,
  villagesByDistrict,
} from "@/features/orders/order-schema";
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
  /** Commit изменений (тап «Готово»). */
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
  const [open, setOpen] = useState(false);
  const tc = useThemeColors(["ink", "mute", "on-primary"]);

  // Draft-state локально внутри sheet'а — commit только на тап «Готово».
  const [draftCity, setDraftCity] = useState(cityId);
  const [draftDistrict, setDraftDistrict] = useState(district);

  // При каждом открытии sheet'а — синхронизируем draft с актуальными props.
  useEffect(() => {
    if (open) {
      setDraftCity(cityId);
      setDraftDistrict(district);
    }
  }, [open, cityId, district]);

  function handleApply() {
    onChange({ cityId: draftCity, district: draftDistrict });
    setOpen(false);
  }

  // Trigger-label: composed из cityId + district.
  const cityName =
    cityId === ALL_INGUSHETIA_CITY
      ? "Вся Ингушетия"
      : (cities?.find((c) => c.id === cityId)?.name ?? null);
  const triggerParts = [cityName, district].filter((s): s is string => !!s);
  const triggerLabel =
    triggerParts.length === 0 ? "Выберите локацию" : triggerParts.join(" · ");
  const isPlaceholder = triggerParts.length === 0;

  // Активный район для draft (для подсветки sub-row).
  const activeDistrict = isDistrict(draftDistrict)
    ? draftDistrict
    : findDistrictByVillage(draftDistrict);
  const villages = activeDistrict ? villagesByDistrict[activeDistrict] : null;
  const isAllIngush = draftCity === ALL_INGUSHETIA_CITY;

  return (
    <View>
      {/* Trigger — выглядит идентично CategoryPicker'у (тот же form-input стандарт:
          h-12, rounded-md, bg-canvas, px-3, gap-2). Справа — ChevronDown как
          visual-signal что это trigger, открывающий sheet (единый паттерн
          с CategoryPicker). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Выбрать локацию"
        onPress={() => setOpen(true)}
        disabled={disabled}
        className={`mt-2 h-12 flex-row items-center gap-2 rounded-md border bg-canvas px-3 active:opacity-70 ${
          error ? "border-error" : "border-hairline"
        }`}
      >
        <MapPin size={18} strokeWidth={1.75} color={tc.mute} />
        <AppText
          className={`flex-1 text-body-md ${isPlaceholder ? "text-mute" : "text-ink"}`}
          numberOfLines={1}
        >
          {triggerLabel}
        </AppText>
        <ChevronDown size={18} strokeWidth={2} color={tc.mute} />
      </Pressable>

      {error ? (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          {error}
        </AppText>
      ) : null}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Где находится задача"
        subtitle="Выберите город. Район и село — по желанию."
        fullScreen
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* «Вся Ингушетия» — выделенная toggle-карточка. Когда on —
              район/село недоступны (территориальный фильтр снят). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Вся Ингушетия"
            accessibilityState={{ selected: isAllIngush }}
            onPress={() => {
              setDraftCity(ALL_INGUSHETIA_CITY);
              setDraftDistrict("");
            }}
            className={`flex-row items-center gap-3 rounded-lg border p-4 ${
              isAllIngush
                ? "border-ink bg-ink"
                : "border-hairline bg-canvas-soft active:opacity-70"
            }`}
          >
            <View
              className={`h-10 w-10 items-center justify-center rounded-full ${
                isAllIngush ? "bg-on-primary" : "bg-canvas"
              }`}
            >
              <MapPin
                size={18}
                strokeWidth={1.75}
                color={isAllIngush ? tc.ink : tc.ink}
              />
            </View>
            <View className="flex-1">
              <AppText
                weight="semibold"
                className={`text-body-md ${isAllIngush ? "text-on-primary" : "text-ink"}`}
              >
                Вся Ингушетия
              </AppText>
              <AppText
                className={`mt-0.5 text-caption ${
                  isAllIngush ? "text-on-primary" : "text-mute"
                }`}
              >
                Заказ увидят мастера со всей республики
              </AppText>
            </View>
            {isAllIngush ? (
              <Check size={20} strokeWidth={2.25} color={tc["on-primary"]} />
            ) : null}
          </Pressable>

          {/* Города */}
          <AppText weight="semibold" className="mt-6 text-body-sm text-ink">
            {isAllIngush ? "Или выберите город" : "Город"}
          </AppText>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {cities?.map((c) => {
              const selected = draftCity === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setDraftCity(c.id)}
                  className={`h-10 items-center justify-center rounded-pill border px-4 ${
                    selected
                      ? "border-ink bg-ink"
                      : "border-hairline bg-canvas active:opacity-70"
                  }`}
                >
                  <AppText
                    weight="medium"
                    className={`text-body-sm ${selected ? "text-on-primary" : "text-ink"}`}
                  >
                    {c.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Район — недоступен когда выбрана «Вся Ингушетия» (территориальная
              фильтрация снята). Это явный UX-сигнал — нельзя одновременно
              «вся республика» и «конкретный район». */}
          {!isAllIngush ? (
            <>
              <AppText weight="semibold" className="mt-6 text-body-sm text-ink">
                Район{" "}
                <AppText className="text-body-sm text-mute">(необязательно)</AppText>
              </AppText>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {districtOptions.map((d) => {
                  const selected = activeDistrict === d;
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setDraftDistrict(selected ? "" : d)}
                      className={`h-10 items-center justify-center rounded-pill border px-4 ${
                        selected
                          ? "border-ink bg-ink"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-body-sm ${selected ? "text-on-primary" : "text-ink"}`}
                      >
                        {d}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Sub-row сёл выбранного района — гранулярный уровень. */}
              {villages && activeDistrict ? (
                <View className="mt-4">
                  <AppText className="text-caption text-mute">Уточнить село</AppText>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {villages.map((v) => {
                      const selected = draftDistrict === v;
                      return (
                        <Pressable
                          key={v}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() =>
                            setDraftDistrict(selected ? activeDistrict : v)
                          }
                          className={`h-8 items-center justify-center rounded-pill border px-3 ${
                            selected
                              ? "border-ink bg-ink"
                              : "border-hairline bg-canvas active:opacity-70"
                          }`}
                        >
                          <AppText
                            weight="medium"
                            className={`text-caption ${
                              selected ? "text-on-primary" : "text-ink"
                            }`}
                          >
                            {v}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        {/* Sticky bottom CTA */}
        <View className="mt-4 border-t border-hairline pt-4">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!draftCity}
            onPress={handleApply}
          >
            Готово
          </Button>
        </View>
      </BottomSheet>
    </View>
  );
}
