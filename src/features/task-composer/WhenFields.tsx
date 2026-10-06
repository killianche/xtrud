/**
 * Поля шага «Когда?» — срок одним тапом, «К дате» раскрывает полосу дат.
 * Вынесено из `when.tsx` (без изменений JSX), чтобы форма одним экраном
 * (вариант B, №249, docs/COMPOSER_ONE_FORM_2026-10.md) могла показать тот же
 * блок инлайн, без отдельного маршрута.
 */

import { AppText } from "@/components/AppText";
import type { OrderUrgencyValue } from "@/features/orders/order-schema";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { DateStrip } from "@/features/task-composer/DateStrip";
import type { ComposerValues } from "@/features/task-composer/steps";

const OPTIONS: Array<{ id: OrderUrgencyValue; title: string; subtitle: string }> = [
  { id: "urgent", title: "Срочно", subtitle: "Сегодня или завтра" },
  { id: "this_week", title: "На неделе", subtitle: "В ближайшие 7 дней" },
  { id: "this_month", title: "В этом месяце", subtitle: "В ближайшие 30 дней" },
  { id: "flexible", title: "Не срочно", subtitle: "Когда будет удобно специалисту" },
  { id: "by_date", title: "К дате", subtitle: "Выбрать день" },
];

export function WhenFields({
  values,
  patch,
  /** Форма одним экраном после неуспешной попытки «Опубликовать»: срок не
   *  выбран вовсе — короткая подпись под группой (ChoiceRow не умеет красный
   *  текст, см. отчёт реализации №249). */
  showMissingError = false,
}: {
  values: Pick<ComposerValues, "urgency" | "preferredDate">;
  patch: (next: Partial<ComposerValues>) => void;
  showMissingError?: boolean;
}) {
  return (
    <>
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
      {showMissingError ? (
        <AppText accessibilityRole="alert" className="-mt-5 mb-5 px-8 text-ios-footnote text-error">
          Укажите срок
        </AppText>
      ) : null}
    </>
  );
}
