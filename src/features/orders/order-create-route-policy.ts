/**
 * Шаги создания задания — настоящие маршруты Stack (DECISION владельца
 * 2026-09-06: «переделай создание задания с нуля, как у TaskRabbit и iOS»).
 * Один вопрос на экран; «назад» и свайп от края — один POP, черновик жив.
 */
export type OrderCreatePhase = "intent" | "details" | "where" | "when" | "budget" | "review";

/** Любой шаг после «что нужно сделать» требует подтверждённой категории. */
export function isOrderDetailsPhase(phase: OrderCreatePhase): boolean {
  return phase !== "intent";
}

export interface InvalidOrderDetailsRedirectInput {
  screenPhase: OrderCreatePhase;
  draftUiReady: boolean;
  categoriesReady: boolean;
  hasSelectedCategory: boolean;
  isBusy: boolean;
  isPublished: boolean;
}

/**
 * A details route is valid only with a category confirmed by the current
 * allowlist. Cold/deep links without that state must return to the intent
 * route, while an in-flight committed publish must not be interrupted.
 */
export function shouldRedirectInvalidOrderDetails({
  screenPhase,
  draftUiReady,
  categoriesReady,
  hasSelectedCategory,
  isBusy,
  isPublished,
}: InvalidOrderDetailsRedirectInput): boolean {
  return (
    isOrderDetailsPhase(screenPhase) &&
    draftUiReady &&
    categoriesReady &&
    !hasSelectedCategory &&
    !isBusy &&
    !isPublished
  );
}

export interface OrderDraftAutoResumeInput {
  screenPhase: OrderCreatePhase;
  editIntentRequested: boolean;
  draftUiReady: boolean;
  ownerAlreadyHandled: boolean;
  hasValidIntent: boolean;
}

/** A fallback Back from cold details marks intent editing explicitly so a
 * restored draft cannot immediately push the user forward again. */
export function shouldAutoResumeOrderDraft({
  screenPhase,
  editIntentRequested,
  draftUiReady,
  ownerAlreadyHandled,
  hasValidIntent,
}: OrderDraftAutoResumeInput): boolean {
  return (
    screenPhase === "intent" &&
    !editIntentRequested &&
    draftUiReady &&
    !ownerAlreadyHandled &&
    hasValidIntent
  );
}
