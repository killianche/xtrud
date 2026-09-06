/**
 * /find/location-select — выбор места для фильтра ленты заданий.
 *
 * Системная шторка (formSheet) со списком и галочкой — как выбор параметра в
 * приложениях iOS. Первая строка снимает фильтр («Вся Ингушетия»), дальше
 * города, затем районы. Город и район взаимоисключающие — это правило
 * store (setLocation), здесь оно только отражено.
 */

import { Stack, useRouter } from "expo-router";
import { MapPin, MapTrifold } from "phosphor-react-native";
import { useMemo } from "react";
import { type PickerOption, PickerSheetPage } from "@/components/ui";
import { useCities } from "@/features/cities/use-cities";
import { districtOptions } from "@/features/orders/order-schema";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

const ALL_ID = "__all";
const DISTRICT_PREFIX = "district:";

export default function OrdersSearchLocationSelectScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink", "mute"]);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const cities = useCities();

  const currentId = cityId ? cityId : district ? `${DISTRICT_PREFIX}${district}` : ALL_ID;

  const options = useMemo<PickerOption[]>(
    () => [
      {
        id: ALL_ID,
        title: "Вся Ингушетия",
        icon: <MapTrifold size={18} weight="bold" color={tc.ink} />,
      },
      ...(cities.data ?? []).map<PickerOption>((c) => ({
        id: c.id,
        title: c.name,
        subtitle: "Город",
        icon: <MapPin size={18} weight="bold" color={tc.mute} />,
      })),
      ...districtOptions.map<PickerOption>((d) => ({
        id: `${DISTRICT_PREFIX}${d}`,
        title: d,
        subtitle: "Район",
        icon: <MapPin size={18} weight="bold" color={tc.mute} />,
      })),
    ],
    [cities.data, tc.ink, tc.mute],
  );

  const close = () => router.back();

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.6, 1.0],
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: true,
        }}
      />
      <PickerSheetPage
        title="Место"
        options={options}
        selectedId={currentId}
        searchable
        searchPlaceholder="Город или район"
        loading={cities.isLoading}
        errorMessage={cities.error ? "Не удалось загрузить города" : undefined}
        onRetry={() => void cities.refetch()}
        onSelect={(id) => {
          hapticSelection();
          if (id === ALL_ID) setLocation("", "");
          else if (id.startsWith(DISTRICT_PREFIX))
            setLocation("", id.slice(DISTRICT_PREFIX.length));
          else setLocation(id, "");
          close();
        }}
        onClose={close}
      />
    </>
  );
}
