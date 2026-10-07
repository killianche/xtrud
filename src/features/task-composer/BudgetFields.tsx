/**
 * Поля «Какой бюджет?» — сумма и «Договорная» одной строкой. Общие для шага
 * `budget.tsx` и формы одним экраном (№249).
 *
 * №260 (владелец, 2026-10-07): «сумма и кнопка „Договорная“ должны стоять
 * рядом, в одну линию; выбрал договорную — сумма не показывается». Строка —
 * это выбор из двух: поле суммы с капсулой «Договорная» справа; после
 * «Договорной» поле уходит, вместо него — капсула «Указать сумму», которая
 * возвращает поле и ставит в него курсор.
 */

import { Check, Handshake } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Keyboard, type TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { FormSectionLabel, OptionPill } from "@/features/task-composer/OptionPills";
import {
  BUDGET_MAX,
  type ComposerValues,
  formatBudgetInput,
  parseBudgetInput,
} from "@/features/task-composer/steps";
import { useThemeColors } from "@/lib/use-theme-color";

export function BudgetFields({
  values,
  patch,
  /** Форма одним экраном после неуспешной попытки «Опубликовать»: ни сумма,
   *  ни «Договорная» не выбраны — показываем это как ошибку поля, а не
   *  только общим текстом под кнопкой. */
  showMissingError = false,
  /** Подпись «Бюджет» над строкой — на форме; у шага свой заголовок. */
  showLabel = false,
}: {
  values: Pick<ComposerValues, "budgetValue" | "budgetKind">;
  patch: (next: Partial<ComposerValues>) => void;
  showMissingError?: boolean;
  showLabel?: boolean;
}) {
  const tc = useThemeColors(["ink", "on-accent"]);
  const inputRef = useRef<TextInput>(null);
  // «Указать сумму» после «Договорной»: поле появляется — курсор сразу в нём.
  const [focusOnShow, setFocusOnShow] = useState(false);
  const tooBig = values.budgetValue !== null && values.budgetValue > BUDGET_MAX;
  const negotiable = values.budgetValue === null && values.budgetKind === "negotiable";
  const error = tooBig
    ? "Слишком большая сумма"
    : showMissingError && !negotiable && values.budgetValue === null
      ? "Укажите сумму или выберите «Договорная»"
      : null;

  useEffect(() => {
    if (!focusOnShow || negotiable) return;
    setFocusOnShow(false);
    inputRef.current?.focus();
  }, [focusOnShow, negotiable]);

  return (
    <View className="mb-5">
      {showLabel ? <FormSectionLabel>Бюджет</FormSectionLabel> : null}
      {/* Выбор из двух — «сумма» или «договорная»: группа для VoiceOver. */}
      <View accessibilityRole="radiogroup" className="flex-row items-center gap-2 px-4">
        {negotiable ? (
          <>
            <OptionPill
              tall
              grow
              selected
              label="Договорная"
              icon={<Check size={18} weight="bold" color={tc["on-accent"]} />}
              accessibilityLabel="Цена договорная"
              onPress={() => undefined}
            />
            <OptionPill
              tall
              selected={false}
              label="Указать сумму"
              onPress={() => {
                patch({ budgetKind: null });
                setFocusOnShow(true);
              }}
            />
          </>
        ) : (
          <>
            <ComposerField
              ref={inputRef}
              inline
              value={formatBudgetInput(values.budgetValue)}
              onChangeText={(t) => {
                const next = parseBudgetInput(t);
                // Стёр сумму — выбора ещё нет, пока не нажата «Договорная».
                patch({ budgetValue: next, budgetKind: next === null ? null : "fixed" });
              }}
              placeholder="Сумма"
              suffix="₽"
              keyboardType="number-pad"
              returnKeyType="done"
              error={error}
              forceError={showMissingError || tooBig}
              accessibilityLabel="Бюджет в рублях"
            />
            <OptionPill
              tall
              selected={false}
              label="Договорная"
              icon={<Handshake size={18} weight="regular" color={tc.ink} />}
              accessibilityLabel="Цена договорная"
              onPress={() => {
                Keyboard.dismiss();
                patch({ budgetValue: null, budgetKind: "negotiable" });
              }}
            />
          </>
        )}
      </View>
      {error ? (
        <AppText accessibilityRole="alert" className="mt-1.5 ml-8 text-ios-footnote text-error">
          {error}
        </AppText>
      ) : negotiable ? (
        <AppText className="mt-1.5 ml-8 text-ios-footnote text-mute">
          Специалисты предложат свою цену
        </AppText>
      ) : null}
    </View>
  );
}
