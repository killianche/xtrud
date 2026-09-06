/**
 * Навигация между шагами. С экрана проверки любой ответ открывается как
 * обычный шаг с `?from=review`: кнопка становится «Готово» и возвращает
 * на проверку, а не ведёт дальше по цепочке.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useComposer } from "./composer-store";
import { COMPOSER_ROUTE, type ComposerStep, nextStep } from "./steps";

export function useStepNavigation(step: ComposerStep) {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const composer = useComposer();
  const fromReview = params.from === "review" || composer.mode.kind === "edit";

  const goNext = () => {
    if (fromReview) {
      router.back();
      return;
    }
    const next = nextStep(step);
    if (next) router.push(COMPOSER_ROUTE[next] as never);
  };

  return {
    fromReview,
    primaryLabel: fromReview ? "Готово" : "Далее",
    goNext,
    goBack: () => router.back(),
    /** Холодный вход на шаг без категории — к первому вопросу. */
    needsIntent: composer.mode.kind === "create" && composer.ready && !composer.values.l2Id,
  };
}
