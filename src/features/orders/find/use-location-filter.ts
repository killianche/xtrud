/**
 * Фильтр «Место» для экранов поиска заданий — данные для системного меню
 * (Stack.Toolbar.Menu) в шапке. Значение общее для всех экранов поиска
 * (стор фильтров), выбор — сразу, без отдельной шторки.
 */

import { useCities } from "@/features/cities/use-cities";
import { districtOptions } from "@/features/orders/order-schema";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { hapticSelection } from "@/lib/haptics";

export interface LocationFilter {
  cityId: string;
  district: string;
  label: string;
  active: boolean;
  cities: { id: string; name: string }[];
  districts: string[];
  selectAll: () => void;
  selectCity: (id: string) => void;
  selectDistrict: (name: string) => void;
}

export function useLocationFilter(): LocationFilter {
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const citiesQ = useCities();
  const cities = (citiesQ.data ?? []).map((c) => ({ id: c.id, name: c.name }));
  const label = cityId
    ? (cities.find((c) => c.id === cityId)?.name ?? "Город")
    : district || "Вся Ингушетия";
  return {
    cityId,
    district,
    label,
    active: !!(cityId || district),
    cities,
    districts: [...districtOptions],
    selectAll: () => {
      hapticSelection();
      setLocation("", "");
    },
    selectCity: (id) => {
      hapticSelection();
      setLocation(id, "");
    },
    selectDistrict: (name) => {
      hapticSelection();
      setLocation("", name);
    },
  };
}
