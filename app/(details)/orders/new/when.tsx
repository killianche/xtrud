/**
 * /orders/new/when — «Когда?»: срок одним тапом; «К дате» раскрывает полосу
 * ближайших дней. Ничего не выбрано заранее — раньше 90 % заданий уходили с
 * «Не срочно», потому что оно стояло по умолчанию.
 */

import { Redirect } from "expo-router";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { WhenFields } from "@/features/task-composer/WhenFields";

export default function TaskWhenScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("when");
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  return (
    <ComposerScreen
      step="when"
      title="Когда?"
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("when", values)}
      onPrimary={nav.goNext}
    >
      <WhenFields values={values} patch={patch} />
    </ComposerScreen>
  );
}
