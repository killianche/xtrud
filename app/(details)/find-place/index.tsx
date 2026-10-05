/**
 * /find-place — место для «Найти задание» (№238): «Вся Ингушетия», города,
 * районы → «Весь район» / сёла (как в создании задания, 0212).
 */

import { useRouter } from "expo-router";
import { Buildings, GlobeHemisphereEast, MapTrifold } from "phosphor-react-native";
import { InsetGroup, InsetRow } from "@/components/ui";
import { closeFilterSheet, FilterSheetScreen } from "@/features/orders/find/FilterSheet";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { DISTRICTS, PICKER_CITIES } from "@/lib/location-config";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindPlaceScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const village = useOrdersSearchFiltersStore((s) => s.village);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const pick = (c: string, d: string) => {
    setLocation(c, d, "");
    closeFilterSheet(router, "first");
  };

  return (
    <FilterSheetScreen
      title="Место"
      subtitle="Где нужно выполнить задание"
      onClose={() => closeFilterSheet(router, "first")}
    >
      <InsetGroup>
        <InsetRow
          title="Вся Ингушетия"
          icon={<GlobeHemisphereEast size={18} weight="bold" color={tc.ink} />}
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
            icon={<Buildings size={18} weight="bold" color={tc.ink} />}
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
            icon={<MapTrifold size={18} weight="bold" color={tc.ink} />}
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
    </FilterSheetScreen>
  );
}
