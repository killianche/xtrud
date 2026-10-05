/**
 * /find-filters/place — место для фильтра (№235): «Вся Ингушетия», город
 * или район → «Весь район» / село (как в создании задания, 0212).
 */

import { useRouter } from "expo-router";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { DISTRICTS, PICKER_CITIES } from "@/lib/location-config";

export default function FindFilterPlaceScreen() {
  const router = useRouter();
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const village = useOrdersSearchFiltersStore((s) => s.village);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const pick = (c: string, d: string) => {
    setLocation(c, d, "");
    router.back();
  };

  return (
    <FilterSheetScreen title="Место" onBack={() => router.back()}>
      <InsetGroup>
        <InsetRow
          title="Вся Ингушетия"
          selected={!cityId && !district}
          onPress={() => pick("", "")}
          last
        />
      </InsetGroup>
      <InsetGroup title="Город">
        {PICKER_CITIES.map((c, i) => (
          <InsetRow
            key={c.id}
            title={c.name}
            selected={cityId === c.id}
            onPress={() => pick(c.id, "")}
            last={i === PICKER_CITIES.length - 1}
          />
        ))}
      </InsetGroup>
      <InsetGroup title="Район" footer="Район включает свои города и сёла.">
        {DISTRICTS.map((d, i) => (
          <InsetRow
            key={d.id}
            title={d.name}
            value={district === d.name ? village || "Весь район" : undefined}
            navigates
            accessibilityHint="Открывает выбор: весь район или село"
            onPress={() =>
              router.push({ pathname: "/find-filters/district", params: { id: d.id } } as never)
            }
            last={i === DISTRICTS.length - 1}
          />
        ))}
      </InsetGroup>
    </FilterSheetScreen>
  );
}
