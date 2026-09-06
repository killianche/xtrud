/**
 * /orders/new/budget — «Какой бюджет?»: тип цены одним тапом, сумма —
 * цифровой клавиатурой с разделителями тысяч. Договорная — без суммы.
 */

import { Redirect } from "expo-router";
import { useEffect, useRef } from "react";
import type { TextInput } from "react-native";
import type { OrderPriceKind } from "@/features/orders/order-schema";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import {
  BUDGET_MAX,
  formatBudgetInput,
  isStepValid,
  parseBudgetInput,
} from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

const OPTIONS: Array<{ id: OrderPriceKind; title: string; subtitle: string }> = [
  { id: "up_to", title: "До суммы", subtitle: "Больше этой суммы не готов платить" },
  { id: "from", title: "От суммы", subtitle: "Готов обсуждать выше этой суммы" },
  { id: "fixed", title: "Точная сумма", subtitle: "Плачу ровно столько" },
  { id: "negotiable", title: "Договорная", subtitle: "Мастера предложат свою цену" },
];

export default function TaskBudgetScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("budget");
  const inputRef = useRef<TextInput>(null);
  const needsAmount = values.budgetKind !== null && values.budgetKind !== "negotiable";
  useEffect(() => {
    if (needsAmount && values.budgetValue === null) inputRef.current?.focus();
  }, [needsAmount, values.budgetValue]);
  if (nav.needsIntent) return <Redirect href="/orders/new" />;

  const tooBig = values.budgetValue !== null && values.budgetValue > BUDGET_MAX;
  return (
    <ComposerScreen
      step="budget"
      title="Какой бюджет?"
      subtitle="Мастера видят бюджет и откликаются с ценой и сроком."
      onBack={nav.goBack}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("budget", values)}
      onPrimary={nav.goNext}
    >
      <ChoiceGroup>
        {OPTIONS.map((o, i) => (
          <ChoiceRow
            key={o.id}
            title={o.title}
            subtitle={o.subtitle}
            selected={values.budgetKind === o.id}
            onPress={() =>
              patch({
                budgetKind: o.id,
                budgetValue: o.id === "negotiable" ? null : values.budgetValue,
              })
            }
            last={i === OPTIONS.length - 1}
          />
        ))}
      </ChoiceGroup>
      {needsAmount ? (
        <ComposerField
          ref={inputRef}
          size="title"
          value={formatBudgetInput(values.budgetValue)}
          onChangeText={(t) => patch({ budgetValue: parseBudgetInput(t) })}
          placeholder="0"
          suffix="₽"
          keyboardType="number-pad"
          returnKeyType="done"
          error={tooBig ? "Слишком большая сумма" : null}
          accessibilityLabel="Сумма в рублях"
        />
      ) : null}
    </ComposerScreen>
  );
}
