/**
 * Поля шага «Какой бюджет?» — сумма или кнопка «Договорная». Вынесено из
 * `budget.tsx` (без изменений JSX), чтобы форма одним экраном (вариант B,
 * №249, docs/COMPOSER_ONE_FORM_2026-10.md) показывала тот же блок инлайн.
 */

import { CheckCircle, Handshake } from "phosphor-react-native";
import { Keyboard, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import {
  BUDGET_MAX,
  type ComposerValues,
  formatBudgetInput,
  parseBudgetInput,
} from "@/features/task-composer/steps";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

export function BudgetFields({
  values,
  patch,
  /** Форма одним экраном после неуспешной попытки «Опубликовать»: ни сумма,
   *  ни «Договорная» не выбраны — показываем это как ошибку поля, а не
   *  только общим текстом под кнопкой. */
  showMissingError = false,
}: {
  values: Pick<ComposerValues, "budgetValue" | "budgetKind">;
  patch: (next: Partial<ComposerValues>) => void;
  showMissingError?: boolean;
}) {
  const tc = useThemeColors(["accent", "ink"]);
  const tooBig = values.budgetValue !== null && values.budgetValue > BUDGET_MAX;
  const negotiable = values.budgetValue === null && values.budgetKind === "negotiable";
  const error = tooBig
    ? "Слишком большая сумма"
    : showMissingError && !negotiable
      ? "Укажите сумму или нажмите «Договорная»"
      : null;

  return (
    <>
      <ComposerField
        size="title"
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
        forceError={showMissingError}
        accessibilityLabel="Бюджет в рублях"
      />
      <View className="px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Цена договорная"
          accessibilityState={{ selected: negotiable }}
          onPress={() => {
            hapticSelection();
            Keyboard.dismiss();
            patch({ budgetValue: null, budgetKind: "negotiable" });
          }}
          className={`min-h-14 flex-row items-center justify-center gap-2 rounded-2xl px-4 ${
            negotiable
              ? "border-2 border-accent bg-accent-soft"
              : "border border-hairline bg-canvas-soft active:opacity-70"
          }`}
        >
          {negotiable ? (
            <CheckCircle size={22} weight="fill" color={tc.accent} />
          ) : (
            <Handshake size={22} weight="bold" color={tc.ink} />
          )}
          <AppText
            weight="semibold"
            className={`text-body-lg ${negotiable ? "text-accent" : "text-ink"}`}
          >
            Договорная
          </AppText>
        </Pressable>
      </View>
    </>
  );
}
