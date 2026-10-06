/**
 * /find-place — место для «Найти задание» (№238): «Вся Ингушетия», города,
 * районы → «Весь район» / сёла (как в создании задания, 0212).
 *
 * Владелец, 2026-10-06 (№244, скриншот): «выглядит очень некрасиво». Было:
 * у каждой строки одна и та же серая иконка (здание у всех городов, карта у
 * всех районов) — повтор без смысла; выбор — розовой заливкой отдельной
 * плашки «Вся Ингушетия»; село можно было найти, только зная район. Стало,
 * как выбор в «Настройках» iOS и место у Авито: поиск «город, район или
 * село» сверху; строки без иконок; выбор — галочкой (`checked`, вариант
 * строки для фильтров); «Вся Ингушетия» — первой строкой городов.
 */

import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { InsetGroup, InsetRow, SearchField } from "@/components/ui";
import { closeFilterSheet, FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { searchPlaces } from "@/features/orders/find/place-search";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { DISTRICTS, PICKER_CITIES } from "@/lib/location-config";

export default function FindPlaceScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const village = useOrdersSearchFiltersStore((s) => s.village);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const pick = (c: string, d: string, v = "") => {
    setLocation(c, d, v);
    closeFilterSheet(router, "first");
  };
  const results = searchPlaces(query);

  return (
    <FilterSheetScreen
      title="Место"
      subtitle="Где искать задания"
      onClose={() => closeFilterSheet(router, "first")}
      header={
        <View className="mb-5 px-4">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Город, район или село"
            accessibilityLabel="Поиск места"
          />
        </View>
      }
    >
      {query.trim().length > 0 ? (
        results.length > 0 ? (
          <InsetGroup>
            {results.map((r, i) => (
              <InsetRow
                key={`${r.kind}:${r.cityId}:${r.district}:${r.village}`}
                title={r.title}
                subtitle={r.subtitle}
                checked={cityId === r.cityId && district === r.district && village === r.village}
                onPress={() => pick(r.cityId, r.district, r.village)}
                last={i === results.length - 1}
              />
            ))}
          </InsetGroup>
        ) : (
          <AppText className="px-8 pt-4 text-center text-ios-body text-mute">
            Такого места нет. Проверьте название.
          </AppText>
        )
      ) : (
        <>
          <InsetGroup title="Города">
            <InsetRow
              title="Вся Ингушетия"
              checked={!cityId && !district}
              onPress={() => pick("", "")}
            />
            {PICKER_CITIES.map((c, i) => (
              <InsetRow
                key={c.id}
                title={c.name}
                checked={cityId === c.id}
                onPress={() => pick(c.id, "")}
                last={i === PICKER_CITIES.length - 1}
              />
            ))}
          </InsetGroup>
          <InsetGroup title="Районы" footer="Район включает свои города и сёла.">
            {DISTRICTS.map((d, i) => (
              <InsetRow
                key={d.id}
                title={d.name}
                value={district === d.name ? village || "Весь район" : undefined}
                navigates
                accessibilityHint="Открывает выбор: весь район или село"
                onPress={() =>
                  router.push({ pathname: "/find-place/district", params: { id: d.id } } as never)
                }
                last={i === DISTRICTS.length - 1}
              />
            ))}
          </InsetGroup>
        </>
      )}
    </FilterSheetScreen>
  );
}
