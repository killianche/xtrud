/**
 * /category/city-select — пикер города для фильтра списка мастеров в категории.
 *
 * См. `sort-select.tsx` — тот же паттерн перехода на нативную iOS
 * `formSheet`-модальность и тот же handshake через
 * `useCategoryFilterPickerStore` + `router.back()`.
 *
 * ~13 городов Ингушетии — на обычном шрифте список короткий, но на
 * accessibility-размерах (Dynamic Type без искусственного капа, см.
 * `docs/IOS_FOUNDATION.md` §3.4) высота строк заметно растёт и суммарно может
 * не поместиться в `fitToContents`. Поэтому — массив detents `[0.6, 1.0]` со
 * скроллом внутри card (а не `fitToContents`), плюс
 * `sheetExpandsWhenScrolledToEdge`, чтобы скролл списка сам разворачивал card
 * до полной высоты.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { MapPin } from "phosphor-react-native";
import { CITIES, type CityId } from "@/components/CitySelector";
import { type PickerOption, PickerSheetPage } from "@/components/ui";
import { useCategoryFilterPickerStore } from "@/features/categories/category-filter-picker-store";
import { useThemeColors } from "@/lib/use-theme-color";

function isCityId(value: string | undefined): value is CityId {
  return !!value && CITIES.some((c) => c.id === value);
}

// Параметры шторки — константа модуля. Объект, создаваемый заново при каждом
// рендере, заставлял систему переоткрывать шторку и сбрасывать выбор
// (владелец, 2026-09-07: «нажимаю категорию — не выбирается, шторка
// открывается повторно»).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.6, 1.0],
  sheetExpandsWhenScrolledToEdge: true,
  sheetGrabberVisible: true,
};

export default function CitySelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cityId?: string }>();
  const setCityResult = useCategoryFilterPickerStore((s) => s.setCityResult);
  const tc = useThemeColors(["ink"]);

  const currentCityId: CityId = isCityId(params.cityId) ? params.cityId : "all";

  const close = () => router.back();

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <PickerSheetPage
        title="Город"
        options={CITIES.map<PickerOption>((c) => ({
          id: c.id,
          title: c.name,
          icon: <MapPin size={18} weight="bold" color={tc.ink} />,
        }))}
        selectedId={currentCityId}
        onSelect={(id) => {
          if (isCityId(id)) setCityResult(id);
          close();
        }}
        onClose={close}
      />
    </>
  );
}
