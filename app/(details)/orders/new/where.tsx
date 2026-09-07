/**
 * /orders/new/where — «Где нужно выполнить?»: город или район одним тапом.
 * Либо город (включая «Вся Ингушетия»), либо район — взаимоисключающе,
 * как в фильтрах ленты.
 */

import { Redirect } from "expo-router";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { ADDRESS_MAX, isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { ALL_INGUSHETIA_CITY_ID, DISTRICTS, PICKER_CITIES } from "@/lib/location-config";

export default function TaskWhereScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("where");
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const cities = [{ id: ALL_INGUSHETIA_CITY_ID, name: "Вся Ингушетия" }, ...PICKER_CITIES];
  return (
    <ComposerScreen
      step="where"
      title="Где нужно выполнить?"
      subtitle="Мастера ищут задания рядом с собой."
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
            selected={values.cityId === c.id}
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
          hint="Поможет мастеру понять, далеко ли ехать. Квартиру и подъезд писать не нужно."
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
