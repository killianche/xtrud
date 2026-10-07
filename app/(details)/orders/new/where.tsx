/**
 * /orders/new/where — «Где нужно выполнить?»: город или село одним касанием.
 *
 * №266 (владелец, 2026-10-07): «вначале города, потом вместо районов все
 * сёла по имени — чтобы человек сразу выбрал своё село, не заходя в район».
 * Район целиком больше не выбирается; у старого задания с районом выбор
 * просто не отмечен, пока не выберут город или село. Село хранится, как и
 * раньше, с его районом (0212, docs/LOCATION_MODEL_2026-10.md) — по району
 * задание видят мастера всего района.
 *
 * Сёл 34 и список неизменный — обычная группа строк, как в «Настройках»;
 * виртуализация здесь не нужна. Адрес — сверху: после выбора села внизу
 * поле ниже списка было бы за экраном.
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
  FILTER_VILLAGES,
  findDistrictByVillage,
  PICKER_CITIES,
} from "@/lib/location-config";

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
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("where", values)}
      onPrimary={nav.goNext}
    >
      <ComposerField
        label="Адрес · по желанию"
        value={values.address}
        onChangeText={(t) => patch({ address: t.slice(0, ADDRESS_MAX) })}
        placeholder="Улица, дом"
        returnKeyType="done"
        textContentType="fullStreetAddress"
        accessibilityLabel="Адрес"
      />
      <ChoiceGroup title="Город">
        {cities.map((c, i) => (
          <ChoiceRow
            key={c.id}
            title={c.name}
            selected={values.cityId === c.id}
            onPress={() => patch({ cityId: c.id, district: "", village: "" })}
            last={i === cities.length - 1}
          />
        ))}
      </ChoiceGroup>
      <ChoiceGroup title="Село">
        {FILTER_VILLAGES.map((v, i) => (
          <ChoiceRow
            key={v}
            title={v}
            selected={!values.cityId && values.village === v}
            onPress={() =>
              patch({ cityId: "", district: findDistrictByVillage(v) ?? "", village: v })
            }
            last={i === FILTER_VILLAGES.length - 1}
          />
        ))}
      </ChoiceGroup>
    </ComposerScreen>
  );
}
