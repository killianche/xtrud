export interface InvalidOrderDetailsRedirectInput {
  screenPhase: "intent" | "details";
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
    screenPhase === "details" &&
    draftUiReady &&
    categoriesReady &&
    !hasSelectedCategory &&
    !isBusy &&
    !isPublished
  );
}

export interface OrderDraftAutoResumeInput {
  screenPhase: "intent" | "details";
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
