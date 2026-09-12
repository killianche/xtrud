/**
 * /orders/new/budget — «Какой бюджет?»: одно поле суммы.
 *
 * DECISION владельца 2026-09-12: «убери плашки, сделай просто поле ввода».
 * Раньше здесь выбирали тип цены (до / от / точная / договорная) — четыре
 * строки ради одного числа. Теперь: ввёл сумму — мастера видят её, оставил
 * пустым — цена договорная. Тип в базе остался (order_price_kind), но
 * человек его больше не выбирает: сумма сохраняется как fixed, пусто — как
 * negotiable. Так же устроено поле цены в отклике мастера.
 */

import { Redirect } from "expo-router";
import { useEffect, useRef } from "react";
import type { TextInput } from "react-native";
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

export default function TaskBudgetScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("budget");
  const inputRef = useRef<TextInput>(null);
  // Поле на экране одно — открываем клавиатуру сразу, без лишнего касания.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, []);
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const tooBig = values.budgetValue !== null && values.budgetValue > BUDGET_MAX;
  return (
    <ComposerScreen
      step="budget"
      title="Какой бюджет?"
      subtitle="Мастера видят бюджет и откликаются с ценой и сроком."
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
          patch({ budgetValue: next, budgetKind: next === null ? "negotiable" : "fixed" });
        }}
        placeholder="Договорная"
        suffix="₽"
        keyboardType="number-pad"
        returnKeyType="done"
        error={tooBig ? "Слишком большая сумма" : null}
        hint="Пусто — мастера предложат свою цену."
        accessibilityLabel="Бюджет в рублях"
      />
    </ComposerScreen>
  );
}
