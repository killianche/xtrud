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
import { BudgetFields } from "@/features/task-composer/BudgetFields";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

export default function TaskBudgetScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("budget");
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

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
      <BudgetFields values={values} patch={patch} />
    </ComposerScreen>
  );
}
