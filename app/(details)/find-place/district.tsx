/**
 * /find-place/district?id= — район (№238): «Весь район» (с его городами) или
 * село — в селе видны и задания на весь район. Выбор закрывает шторку.
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { InsetGroup, InsetRow } from "@/components/ui";
import { closeFilterSheet, FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { CITY_IDS_BY_DISTRICT_ID, DISTRICTS, getCityName } from "@/lib/location-config";

export default function FindPlaceDistrictScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const village = useOrdersSearchFiltersStore((s) => s.village);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const d = DISTRICTS.find((x) => x.id === id);
  if (!d) return <Redirect href="/find-place" />;

  const chosen = district === d.name;
  const cityNames = [
    ...new Set((CITY_IDS_BY_DISTRICT_ID[d.id] ?? []).map((cid) => getCityName(cid))),
  ];
  const pick = (v: string) => {
    setLocation("", d.name, v);
    closeFilterSheet(router, "nested");
  };

  return (
    <FilterSheetScreen
      title={d.name}
      onBack={() => router.back()}
      onClose={() => closeFilterSheet(router, "nested")}
    >
      <InsetGroup>
        <InsetRow
          title="Весь район"
          subtitle={cityNames.length > 0 ? `Включая ${cityNames.join(", ")}` : undefined}
          checked={chosen && !village}
          onPress={() => pick("")}
          last
        />
      </InsetGroup>
      <InsetGroup title="Село" footer="В селе видны и задания на весь район.">
        {d.villages.map((v, i) => (
          <InsetRow
            key={v}
            title={v}
            checked={chosen && village === v}
            onPress={() => pick(v)}
            last={i === d.villages.length - 1}
          />
        ))}
      </InsetGroup>
    </FilterSheetScreen>
  );
}
