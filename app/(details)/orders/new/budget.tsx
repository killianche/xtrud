/**
 * /orders/new/budget — «Какой бюджет?»: поле суммы и отдельная кнопка
 * «Договорная» (владелец, 2026-09-16: «договорная — отдельная кнопка, если
 * человек хочет нажимать; если вписывает цену — тоже; микрокомментарии
 * убрать»).
 *
 * Ввёл сумму — цена fixed, кнопка гаснет. Нажал «Договорная» — поле
 * очищается, цена negotiable. «Далее» доступна после одного из двух.
 */

import { Redirect } from "expo-router";
import { CheckCircle, Handshake } from "phosphor-react-native";
import { useRef } from "react";
import { Keyboard, Pressable, type TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import {
  BUDGET_MAX,
  formatBudgetInput,
  isStepValid,
  parseBudgetInput,
} from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

export default function TaskBudgetScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("budget");
  const inputRef = useRef<TextInput>(null);
  const tc = useThemeColors(["accent", "ink"]);
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const tooBig = values.budgetValue !== null && values.budgetValue > BUDGET_MAX;
  const negotiable = values.budgetValue === null && values.budgetKind === "negotiable";

  return (
    <ComposerScreen
      step="budget"
      title="Какой бюджет?"
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("budget", values)}
      onPrimary={nav.goNext}
    >
      <ComposerField
        ref={inputRef}
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
        error={tooBig ? "Слишком большая сумма" : null}
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
    </ComposerScreen>
  );
}
