/**
 * Поля «Когда?» — срок капсулами в один-два ряда, «К дате» раскрывает полосу
 * дат. Общие для шага `when.tsx` и формы одним экраном (№249).
 *
 * №260 (владелец, 2026-10-07): пять строк списка с подписями занимали
 * полэкрана — «сократить, как у Авито и YouDo». Капсулы вместо строк;
 * пояснение — одной строкой под ними и только для выбранного. «В этом
 * месяце» новым заданиям не предлагается (между «На неделе» и «Не срочно»
 * разница не нужна для выбора), но у старого задания с этим сроком
 * капсула остаётся, чтобы правка не сбрасывала ответ.
 */

import { CalendarBlank } from "phosphor-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import type { OrderUrgencyValue } from "@/features/orders/order-schema";
import { DateStrip } from "@/features/task-composer/DateStrip";
import { FormSectionLabel, OptionPill, OptionPillRow } from "@/features/task-composer/OptionPills";
import type { ComposerValues } from "@/features/task-composer/steps";
import { useThemeColors } from "@/lib/use-theme-color";

const OPTIONS: Array<{ id: OrderUrgencyValue; title: string; hint: string }> = [
  { id: "urgent", title: "Срочно", hint: "Сегодня или завтра" },
  { id: "this_week", title: "На неделе", hint: "В ближайшие 7 дней" },
  { id: "this_month", title: "В этом месяце", hint: "В ближайшие 30 дней" },
  { id: "flexible", title: "Не срочно", hint: "Когда будет удобно специалисту" },
  { id: "by_date", title: "К дате", hint: "Выберите день" },
];

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(new Date(`${iso}T00:00:00`))
    .replace(".", "");
}

export function WhenFields({
  values,
  patch,
  /** Форма одним экраном после неуспешной попытки «Опубликовать»: срок не
   *  выбран вовсе — короткая подпись под капсулами. */
  showMissingError = false,
  /** Подпись «Когда» над капсулами — на форме; у шага свой заголовок. */
  showLabel = false,
}: {
  values: Pick<ComposerValues, "urgency" | "preferredDate">;
  patch: (next: Partial<ComposerValues>) => void;
  showMissingError?: boolean;
  showLabel?: boolean;
}) {
  const tc = useThemeColors(["ink", "on-accent"]);
  const options = OPTIONS.filter((o) => o.id !== "this_month" || values.urgency === "this_month");
  const selected = OPTIONS.find((o) => o.id === values.urgency);
  const byDate = values.urgency === "by_date";
  // Пояснение — только к выбранному; у выбранной даты оно уже в капсуле.
  const hint = byDate && values.preferredDate ? null : (selected?.hint ?? null);

  return (
    <View className="mb-5">
      {showLabel ? <FormSectionLabel>Когда</FormSectionLabel> : null}
      <OptionPillRow>
        {options.map((o) => {
          const isOn = values.urgency === o.id;
          const label =
            o.id === "by_date" && isOn && values.preferredDate
              ? `К ${shortDate(values.preferredDate)}`
              : o.title;
          return (
            // Сетка 2×2 одинаковой ширины: четыре капсулы не помещаются в
            // одну строку, а перенос оставлял «К дате» одну во втором ряду.
            <View key={o.id} className="grow basis-[45%]">
              <OptionPill
                grow
                label={label}
                selected={isOn}
                icon={
                  o.id === "by_date" ? (
                    <CalendarBlank
                      size={18}
                      weight={isOn ? "fill" : "regular"}
                      color={isOn ? tc["on-accent"] : tc.ink}
                    />
                  ) : undefined
                }
                onPress={() =>
                  patch({
                    urgency: o.id,
                    preferredDate: o.id === "by_date" ? values.preferredDate : null,
                  })
                }
              />
            </View>
          );
        })}
      </OptionPillRow>
      {hint ? <AppText className="mt-2 ml-8 text-ios-footnote text-mute">{hint}</AppText> : null}
      {byDate ? (
        // У полосы дат свой нижний отступ — здесь он не нужен.
        <View className="mt-3 -mb-6">
          <DateStrip
            value={values.preferredDate}
            onChange={(iso) => patch({ preferredDate: iso })}
          />
        </View>
      ) : null}
      {showMissingError ? (
        <AppText accessibilityRole="alert" className="mt-2 px-8 text-ios-footnote text-error">
          Укажите срок
        </AppText>
      ) : null}
    </View>
  );
}
