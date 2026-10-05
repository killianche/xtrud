/**
 * /orders/new/where — «Где нужно выполнить?»: город одним тапом или район.
 * Район включает свои города (они отмечены «входит»). Тап по району открывает
 * его экран (`orders/new/district`) — «Весь район» или конкретное село
 * (владелец, 2026-10-05: «надо, чтобы мог выбрать конкретное село»; модель —
 * docs/LOCATION_MODEL_2026-10.md, 0212). Как в «Настройках» iOS: выбор
 * виден значением справа у строки района.
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { ADDRESS_MAX, isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import {
  ALL_INGUSHETIA_CITY_ID,
  CITY_IDS_BY_DISTRICT_ID,
  DISTRICTS,
  PICKER_CITIES,
} from "@/lib/location-config";

export default function TaskWhereScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const { values, patch } = useComposer();
  const nav = useStepNavigation("where");
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const cities = [{ id: ALL_INGUSHETIA_CITY_ID, name: "Вся Ингушетия" }, ...PICKER_CITIES];
  // Район включает свои города (владелец, 2026-10-03: «район не должен
  // вычёркивать город, он должен его включать»): выбран район — его город
  // отмечен галочкой «входит», выбранным остаётся сам район.
  const selectedDistrict = DISTRICTS.find((d) => d.name === values.district);
  // Выбрано село — район целиком не выбран, его город не «входит».
  const includedCityIds =
    selectedDistrict && !values.village ? (CITY_IDS_BY_DISTRICT_ID[selectedDistrict.id] ?? []) : [];
  return (
    <ComposerScreen
      step="where"
      title="Где нужно выполнить?"
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("where", values)}
      onPrimary={nav.goNext}
    >
      <ChoiceGroup title="Город">
        {cities.map((c, i) => (
          <ChoiceRow
            key={c.id}
            title={c.name}
            subtitle={includedCityIds.includes(c.id) ? `Входит в ${values.district}` : undefined}
            selected={values.cityId === c.id}
            checked={includedCityIds.includes(c.id)}
            onPress={() => patch({ cityId: c.id, district: "", village: "" })}
            last={i === cities.length - 1}
          />
        ))}
      </ChoiceGroup>
      {values.cityId || values.district ? (
        <ComposerField
          label="Адрес"
          value={values.address}
          onChangeText={(t) => patch({ address: t.slice(0, ADDRESS_MAX) })}
          placeholder="Улица, дом — по желанию"
          returnKeyType="done"
          textContentType="fullStreetAddress"
          accessibilityLabel="Адрес"
        />
      ) : null}
      <ChoiceGroup title="Район">
        {DISTRICTS.map((d, i) => {
          const chosen = values.district === d.name;
          return (
            <ChoiceRow
              key={d.id}
              title={d.name}
              // Выбранное — значением справа: село или «Весь район».
              value={chosen ? values.village || "Весь район" : undefined}
              navigates
              accessibilityHint="Открывает выбор: весь район или село"
              onPress={() =>
                router.push({
                  pathname: "/orders/new/district",
                  params: params.from === "review" ? { id: d.id, from: "review" } : { id: d.id },
                } as never)
              }
              last={i === DISTRICTS.length - 1}
            />
          );
        })}
      </ChoiceGroup>
    </ComposerScreen>
  );
}
