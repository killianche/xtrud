// Хук доступа к общему состоянию сессии.
//
// Тонкая обёртка: вся логика живёт в auth-session-store, потому что среда
// тестов работает без рендера React и правила стора иначе нельзя проверить.
// Сигнатура намеренно не менялась — её используют 43 места.

import { useSyncExternalStore } from "react";
import {
  type AuthSessionState,
  type AuthStatus,
  getAuthSessionSnapshot,
  subscribeToAuthSession,
} from "@/features/auth/auth-session-store";

export type { AuthSessionState, AuthStatus };

export function useAuthSession(): AuthSessionState {
  return useSyncExternalStore(
    subscribeToAuthSession,
    getAuthSessionSnapshot,
    getAuthSessionSnapshot,
  );
}
