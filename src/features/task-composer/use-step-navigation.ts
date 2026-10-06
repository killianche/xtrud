/**
 * Навигация между шагами. С экрана проверки любой ответ открывается как
 * обычный шаг с `?from=review`: кнопка становится «Готово» и возвращает
 * на проверку, а не ведёт дальше по цепочке.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useAppFlags } from "@/features/settings/use-app-flags";
import { useComposer } from "./composer-store";
import { COMPOSER_ROUTE, type ComposerStep, nextStep } from "./steps";
import { useComposerClose } from "./use-composer-close";

export function useStepNavigation(step: ComposerStep) {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const composer = useComposer();
  const close = useComposerClose();
  // Форма одним экраном (вариант B, №249): после подсказки категории «Далее»
  // ведёт прямо на форму (review), минуя title/where/when/budget/contacts.
  const form = useAppFlags().composerForm;
  const fromReview = params.from === "review" || composer.mode.kind === "edit";

  const goNext = () => {
    if (fromReview) {
      router.back();
      return;
    }
    const next = nextStep(step, form);
    if (next) router.push(COMPOSER_ROUTE[next] as never);
  };

  return {
    fromReview,
    primaryLabel: fromReview ? "Готово" : "Далее",
    goNext,
    goBack: () => router.back(),
    /** «Закрыть» с любого шага — лист «сохранить/удалить черновик». */
    close,
    /** Черновик ещё читается с диска — экран не рисуем, чтобы не мигали пустые ответы. */
    notReady: !composer.ready,
    /** Холодный вход на шаг без категории — к первому вопросу. */
    needsCategory: composer.mode.kind === "create" && composer.ready && !composer.values.l2Id,
  };
}
