/**
 * /orders/new/when — «Когда?»: срок одним тапом; «К дате» раскрывает полосу
 * ближайших дней. Ничего не выбрано заранее — раньше 90 % заданий уходили с
 * «Не срочно», потому что оно стояло по умолчанию.
 */

import { Redirect } from "expo-router";
import type { OrderUrgencyValue } from "@/features/orders/order-schema";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { DateStrip } from "@/features/task-composer/DateStrip";
import { isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

const OPTIONS: Array<{ id: OrderUrgencyValue; title: string; subtitle: string }> = [
  { id: "urgent", title: "Срочно", subtitle: "Сегодня или завтра" },
  { id: "this_week", title: "На неделе", subtitle: "В ближайшие 7 дней" },
  { id: "this_month", title: "В этом месяце", subtitle: "В ближайшие 30 дней" },
  { id: "flexible", title: "Не срочно", subtitle: "Когда будет удобно мастеру" },
  { id: "by_date", title: "К дате", subtitle: "Выбрать день" },
];

export default function TaskWhenScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("when");
  if (nav.notReady) return null;
  if (nav.needsIntent) return <Redirect href="/orders/new" />;

  return (
    <ComposerScreen
      step="when"
      title="Когда?"
      subtitle="Срок виден в карточке задания."
      onBack={nav.goBack}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("when", values)}
      onPrimary={nav.goNext}
    >
      <ChoiceGroup>
        {OPTIONS.map((o, i) => (
          <ChoiceRow
            key={o.id}
            title={o.title}
            subtitle={o.subtitle}
            selected={values.urgency === o.id}
            onPress={() =>
              patch({
                urgency: o.id,
                preferredDate: o.id === "by_date" ? values.preferredDate : null,
              })
            }
            last={i === OPTIONS.length - 1}
          />
        ))}
      </ChoiceGroup>
      {values.urgency === "by_date" ? (
        <DateStrip value={values.preferredDate} onChange={(iso) => patch({ preferredDate: iso })} />
      ) : null}
    </ComposerScreen>
  );
}
