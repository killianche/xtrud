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
  /** Backward-compatible API для существующего master-onboarding flow. */
  setReturnUrl: (url: string | null) => void;
  peekReturnUrl: () => string | null;
  consumeReturnUrl: () => string | null;
  clearReturnUrl: () => void;
}

export const useAuthReturnUrlStore = create<AuthReturnUrlState>()(
  persist(
    (set, get) => ({
      returnUrl: null,
      intent: null,
      setReturnUrl: (url) => {
        const safeUrl = parseAuthReturnTo(url);
        set({
          returnUrl: safeUrl,
          intent: safeUrl ? createAuthReturnIntent(safeUrl) : null,
        });
      },
      peekReturnUrl: () => {
        const { intent } = get();
        if (isAuthReturnIntentActive(intent)) return intent.returnTo;
        if (intent || get().returnUrl) set({ returnUrl: null, intent: null });
        return null;
      },
      consumeReturnUrl: () => {
        const consumed = consumeAuthReturnIntent(get().intent);
        set({ returnUrl: null, intent: consumed.nextIntent });
        return consumed.returnTo;
      },
      clearReturnUrl: () => set({ returnUrl: null, intent: null }),
    }),
    {
      name: "xtrud:auth-return-url",
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ intent: state.intent }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { intent?: AuthReturnIntent } | undefined;
        const intent = isAuthReturnIntentActive(persisted?.intent) ? persisted?.intent : null;
        return {
          ...currentState,
          intent,
          returnUrl: intent?.returnTo ?? null,
        };
      },
    },
  ),
);
