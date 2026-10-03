/**
 * /orders/new/where — «Где нужно выполнить?»: город или район одним тапом.
 * Либо город (включая «Вся Ингушетия»), либо район — как в фильтрах ленты;
 * район включает свои города (они отмечены «входит»). Выбор села — после
 * решения владельца по модели места (docs/LOCATION_MODEL_2026-10.md).
 */

import { Redirect } from "expo-router";
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
  const { values, patch } = useComposer();
  const nav = useStepNavigation("where");
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const cities = [{ id: ALL_INGUSHETIA_CITY_ID, name: "Вся Ингушетия" }, ...PICKER_CITIES];
  // Район включает свои города (владелец, 2026-10-03: «район не должен
  // вычёркивать город, он должен его включать»): выбран район — его город
  // отмечен галочкой «входит», выбранным остаётся сам район.
  const selectedDistrict = DISTRICTS.find((d) => d.name === values.district);
  const includedCityIds = selectedDistrict
    ? (CITY_IDS_BY_DISTRICT_ID[selectedDistrict.id] ?? [])
    : [];
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
            onPress={() => patch({ cityId: c.id, district: "" })}
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
        {DISTRICTS.map((d, i) => (
          <ChoiceRow
            key={d.id}
            title={d.name}
            subtitle={d.villages.slice(0, 3).join(", ") + (d.villages.length > 3 ? "…" : "")}
            selected={values.district === d.name}
            onPress={() => patch({ cityId: "", district: d.name })}
            last={i === DISTRICTS.length - 1}
          />
        ))}
      </ChoiceGroup>
    </ComposerScreen>
  );
}
