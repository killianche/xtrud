/**
 * /orders/location-select — полноценная страница выбора локации заказа.
 *
 * Раньше выбор локации жил в bottom-sheet (`LocationPicker` → `BottomSheet`),
 * а выбор категории — в отдельном route (`/orders/category-select`). Два разных
 * механизма открытия = разный стиль окна. По фидбэку владельца 2026-05-24
 * («обе кнопки должны открываться в одном стиле окна») унифицировано: ОБА
 * селектора теперь — отдельные full-screen route-экраны с единым chrome
 * (ScreenHeader + bg-canvas + slide-from-right анимация стека). Bottom-sheet на
 * web давал визуальные артефакты (z-index/backdrop) — поэтому правильное
 * направление унификации именно «оба как страницы», а не «оба как шиты».
 *
 * UX (Lazyweb: Craigslist/Zillow/Live Nation — full-page location picker
 * + sticky confirm CTA):
 *   - ScreenHeader «Где находится задача» + back
 *   - «Вся Ингушетия» — карточка-строка сверху (альтернатива тер. фильтру)
 *   - Город / Район — равнозначные секции чипов
 *   - Село выбранного района — вложенный уровень
 *   - Sticky bottom «Готово»
 *
 * Handshake формы (тот же паттерн, что у category-select):
 *   - Текущее значение приходит через URL-params (cityId, district) — работает
 *     и из new.tsx, и из edit/[id].tsx, без зависимости от draft-store.
 *   - Выбор на тап «Готово» → `setSelectedLocation({cityId, district})` в
 *     Zustand-store + `router.back()`. `LocationPicker` (триггер на форме)
 *     слушает store и применяет cityId+district в react-hook-form.
 *
 * Бизнес-логика (mutex город↔район, район↔село, повторный тап = снятие,
 * «Вся Ингушетия» снимает тер. фильтр) перенесена 1-в-1 из прежнего
 * `LocationPicker`-шита — при переносе НЕ менялась.
 */

import { useLocalSearchParams } from "expo-router";
import { Check, MapPin } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, ScreenHeader } from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCities } from "@/features/cities/use-cities";
import {
  ALL_INGUSHETIA_CITY,
  districtOptions,
  findDistrictByVillage,
  isDistrict,
  villagesByDistrict,
} from "@/features/orders/order-schema";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

/** Единый стиль chip-кнопки (город / район / село) — selected = accent-soft,
 *  default = bg-canvas + hairline. h-10 / text-body-sm для всех уровней. */
const chipClass = (selected: boolean) =>
  `h-10 items-center justify-center rounded-pill border px-4 ${
    selected
      ? "border-accent bg-accent-soft"
      : "border-hairline bg-canvas active:opacity-70"
  }`;
const chipTextClass = (selected: boolean) =>
  `text-body-sm ${selected ? "text-accent" : "text-ink"}`;

export default function LocationSelectScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ cityId?: string; district?: string }>();
  const { data: cities } = useCities();
  const setSelectedLocation = useOrderDraftStore((s) => s.setSelectedLocation);
  // safeBack: при deeplink/refresh уходим на /orders/new (родитель формы).
  const goBack = useSafeBack("/(tabs)/orders/new" as const);
  const tc = useThemeColors(["ink", "accent"]);

  // Draft-state локально — commit только на тап «Готово».
  const initialCity = typeof params.cityId === "string" ? params.cityId : "";
  const initialDistrict =
    typeof params.district === "string" ? params.district : "";
  const [draftCity, setDraftCity] = useState(initialCity);
  const [draftDistrict, setDraftDistrict] = useState(initialDistrict);

  function handleApply() {
    setSelectedLocation({ cityId: draftCity, district: draftDistrict });
    goBack();
  }

  // Активный район для draft (для подсветки sub-row сёл).
  const activeDistrict = isDistrict(draftDistrict)
    ? draftDistrict
    : findDistrictByVillage(draftDistrict);
  const villages = activeDistrict ? villagesByDistrict[activeDistrict] : null;
  const isAllIngush = draftCity === ALL_INGUSHETIA_CITY;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Где находится задача" onBack={goBack} />

      <ScrollView
        className="mt-2 flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="px-5 pt-2">
          {/* «Вся Ингушетия» — full-width list-row (паттерн StubHub
              «All venues»). Явная альтернатива территориальному фильтру.
              Когда on — секции город/район скрыты (фильтр снят). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Вся Ингушетия"
            accessibilityState={{ selected: isAllIngush }}
            onPress={() => {
              setDraftCity(ALL_INGUSHETIA_CITY);
              setDraftDistrict("");
            }}
            className={`flex-row items-center gap-3 rounded-lg border p-3.5 ${
              isAllIngush
                ? "border-accent bg-accent-soft"
                : "border-hairline bg-canvas-soft active:opacity-70"
            }`}
          >
            <View className="h-10 w-10 items-center justify-center rounded-md bg-canvas">
              <MapPin
                size={20}
                weight={isAllIngush ? "fill" : "bold"}
                color={isAllIngush ? tc.accent : tc.ink}
              />
            </View>
            <AppText
              weight="semibold"
              className={`flex-1 text-body-md ${isAllIngush ? "text-accent" : "text-ink"}`}
            >
              Вся Ингушетия
            </AppText>
            {isAllIngush ? <Check size={20} weight="fill" color={tc.accent} /> : null}
          </Pressable>

          {/* Город / Район — равнозначные секции, видны когда «Вся Ингушетия»
              не выбрана (территориальный фильтр активен). */}
          {!isAllIngush ? (
            <>
              {/* Города */}
              <AppText
                weight="semibold"
                className="mt-8 text-caption uppercase tracking-wider text-muted"
              >
                Город
              </AppText>
              {cities === undefined ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {[72, 92, 80, 88, 104, 76].map((w) => (
                    <Skeleton key={w} width={w} height={40} className="rounded-pill" />
                  ))}
                </View>
              ) : (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {cities.map((c) => {
                    const selected = draftCity === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          // Город и район — взаимоисключающие. Выбор города
                          // снимает район (и село внутри него).
                          setDraftCity(c.id);
                          setDraftDistrict("");
                        }}
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

              {/* Районы — равнозначная секция. Выбор района снимает город. */}
              <AppText
                weight="semibold"
                className="mt-8 text-caption uppercase tracking-wider text-muted"
              >
                Район
              </AppText>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {districtOptions.map((d) => {
                  // Mutex район↔село: подсветка района ТОЛЬКО когда draftDistrict
                  // буквально равен району, а не «село внутри района».
                  const selected = draftDistrict === d;
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        // Повторный тап на выбранном районе снимает его.
                        if (selected) {
                          setDraftDistrict("");
                        } else {
                          setDraftDistrict(d);
                          setDraftCity("");
                        }
                      }}
                      className={chipClass(selected)}
                    >
                      <AppText weight="medium" className={chipTextClass(selected)}>
                        {d}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Села выбранного района — вложенный гранулярный уровень. */}
              {villages && activeDistrict ? (
                <>
                  <AppText
                    weight="semibold"
                    className="mt-8 text-caption uppercase tracking-wider text-muted"
                  >
                    {`Село · ${activeDistrict.replace(" район", "")}`}
                  </AppText>
                  <View className="mt-3 flex-row flex-wrap gap-2">
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
                          className={chipClass(selected)}
                        >
                          <AppText weight="medium" className={chipTextClass(selected)}>
                            {v}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View
        className="border-t border-hairline px-5 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          // Готово доступно если выбран либо город (включая «Вся Ингушетия»),
          // либо район.
          disabled={!draftCity && !draftDistrict}
          onPress={handleApply}
        >
          Готово
        </Button>
      </View>
    </View>
  );
}
