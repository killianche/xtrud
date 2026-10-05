/**
 * /orders/new/district?id= — район в шаге «Где нужно выполнить?»: «Весь район»
 * или конкретное село (владелец, 2026-10-05: «надо, чтобы мог выбрать
 * конкретное село в задании, указать село»; модель — 0212,
 * docs/LOCATION_MODEL_2026-10.md).
 *
 * Отдельный экран стека, как раздел в «Настройках» iOS: жест «назад»
 * возвращает к шагу. Выбор — галочкой и сразу назад к шагу, где остаются
 * адрес и «Далее». Сёла — из `DISTRICTS` (совпадают с district_villages).
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { CITY_IDS_BY_DISTRICT_ID, DISTRICTS, getCityName } from "@/lib/location-config";

export default function TaskDistrictScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { values, patch } = useComposer();
  const nav = useStepNavigation("where");
  const district = DISTRICTS.find((d) => d.id === params.id);
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;
  if (!district) return <Redirect href="/orders/new/where" />;

  const chosen = values.district === district.name;
  // Район включает свои города — подпись у «Весь район» (владелец, 2026-10-03).
  const cityNames = [
    ...new Set((CITY_IDS_BY_DISTRICT_ID[district.id] ?? []).map((id) => getCityName(id))),
  ];
  const pick = (village: string) => {
    patch({ cityId: "", district: district.name, village });
    router.back();
  };

  return (
    <ComposerScreen
      step="where"
      title={district.name}
      onBack={() => router.back()}
      onClose={nav.close}
      // Выбор сам возвращает к шагу; «Далее» — там.
      hideActions
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("where", values)}
      onPrimary={() => router.back()}
    >
      <ChoiceGroup>
        <ChoiceRow
          title="Весь район"
          subtitle={cityNames.length > 0 ? `Включая ${cityNames.join(", ")}` : undefined}
          selected={chosen && !values.village}
          onPress={() => pick("")}
          last
        />
      </ChoiceGroup>
      <ChoiceGroup title="Село">
        {district.villages.map((v, i) => (
          <ChoiceRow
            key={v}
            title={v}
            selected={chosen && values.village === v}
            onPress={() => pick(v)}
            last={i === district.villages.length - 1}
          />
        ))}
      </ChoiceGroup>
    </ComposerScreen>
  );
}
