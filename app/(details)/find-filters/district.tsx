/**
 * /find-filters/district?id= — район для фильтра (№235): «Весь район» или
 * село (задания села и всего района). Выбор — сразу к «Фильтрам».
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { CITY_IDS_BY_DISTRICT_ID, DISTRICTS, getCityName } from "@/lib/location-config";

export default function FindFilterDistrictScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const village = useOrdersSearchFiltersStore((s) => s.village);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const d = DISTRICTS.find((x) => x.id === id);
  if (!d) return <Redirect href="/find-filters/place" />;

  const chosen = district === d.name;
  const cityNames = [
    ...new Set((CITY_IDS_BY_DISTRICT_ID[d.id] ?? []).map((cid) => getCityName(cid))),
  ];
  // Над «Фильтрами» лежат два экрана: места и этот.
  const pick = (v: string) => {
    setLocation("", d.name, v);
    router.dismiss(2);
  };

  return (
    <FilterSheetScreen title={d.name} onBack={() => router.back()}>
      <InsetGroup>
        <InsetRow
          title="Весь район"
          subtitle={cityNames.length > 0 ? `Включая ${cityNames.join(", ")}` : undefined}
          selected={chosen && !village}
          onPress={() => pick("")}
          last
        />
      </InsetGroup>
      <InsetGroup title="Село" footer="В селе видны и задания на весь район.">
        {d.villages.map((v, i) => (
          <InsetRow
            key={v}
            title={v}
            selected={chosen && village === v}
            onPress={() => pick(v)}
            last={i === d.villages.length - 1}
          />
        ))}
      </InsetGroup>
    </FilterSheetScreen>
  );
}
