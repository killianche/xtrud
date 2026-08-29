/**
 * Единый безопасный return-URL store для auth и onboarding.
 *
 * Поддерживаются только форма нового задания и detail существующего задания с
 * UUID. Любой другой URL отбрасывается, поэтому persisted state и route params
 * не могут превратить auth-flow в open redirect. Intent живёт один час и после
 * успешного возврата потребляется ровно один раз.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type AuthReturnIntent,
  consumeAuthReturnIntent,
  createAuthReturnIntent,
  isAuthReturnIntentActive,
  parseAuthReturnTo,
} from "@/features/auth/auth-return";
import { storage } from "@/lib/storage";

interface AuthReturnUrlState {
  returnUrl: string | null;
  intent: AuthReturnIntent | null;
  performerOnboardingRequested: boolean;
  /** Backward-compatible API для существующего master-onboarding flow. */
  setReturnUrl: (url: string | null) => void;
  requestPerformerOnboarding: (returnUrl: string) => void;
  isPerformerOnboardingRequested: () => boolean;
  peekReturnUrl: () => string | null;
  consumeReturnUrl: () => string | null;
  clearReturnUrl: () => void;
}

export const useAuthReturnUrlStore = create<AuthReturnUrlState>()(
  persist(
    (set, get) => ({
      returnUrl: null,
      intent: null,
      performerOnboardingRequested: false,
      setReturnUrl: (url) => {
        const safeUrl = parseAuthReturnTo(url);
        set({
          returnUrl: safeUrl,
          intent: safeUrl ? createAuthReturnIntent(safeUrl) : null,
          performerOnboardingRequested: false,
        });
      },
      requestPerformerOnboarding: (returnUrl) => {
        const safeUrl = parseAuthReturnTo(returnUrl);
        set({
          returnUrl: safeUrl,
          intent: safeUrl ? createAuthReturnIntent(safeUrl) : null,
          performerOnboardingRequested: !!safeUrl,
        });
      },
      isPerformerOnboardingRequested: () => {
        const { intent, performerOnboardingRequested } = get();
        return performerOnboardingRequested && isAuthReturnIntentActive(intent);
      },
      peekReturnUrl: () => {
        const { intent } = get();
        if (isAuthReturnIntentActive(intent)) return intent.returnTo;
        if (intent || get().returnUrl) {
          set({ returnUrl: null, intent: null, performerOnboardingRequested: false });
        }
        return null;
      },
      consumeReturnUrl: () => {
        const consumed = consumeAuthReturnIntent(get().intent);
        set({
          returnUrl: null,
          intent: consumed.nextIntent,
          performerOnboardingRequested: false,
        });
        return consumed.returnTo;
      },
      clearReturnUrl: () =>
        set({ returnUrl: null, intent: null, performerOnboardingRequested: false }),
    }),
    {
      name: "xtrud:auth-return-url",
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        intent: state.intent,
        performerOnboardingRequested: state.performerOnboardingRequested,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | { intent?: AuthReturnIntent; performerOnboardingRequested?: boolean }
          | undefined;
        const intent = isAuthReturnIntentActive(persisted?.intent) ? persisted?.intent : null;
        return {
          ...currentState,
          intent,
          returnUrl: intent?.returnTo ?? null,
          performerOnboardingRequested:
            !!intent && persisted?.performerOnboardingRequested === true,
        };
      },
    },
  ),
);
