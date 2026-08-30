// Hook для подписки на состояние сессии Supabase.
// Используется в protected route gate в app/_layout.tsx.

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { resolveAuthStateAfterDraft } from "@/features/auth/auth-session-policy";
import { activateOrderDraftOwnerForSession } from "@/lib/order-draft-store";
import { supabase } from "@/lib/supabase";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthSessionState {
  session: Session | null;
  status: AuthStatus;
}

async function bindPrivateDraftToSession(session: Session | null): Promise<void> {
  await activateOrderDraftOwnerForSession(session?.user.id ?? null);
}

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    session: null,
    status: "loading",
  });

  useEffect(() => {
    let mounted = true;
    let authEventSeen = false;

    // Подгружаем текущую сессию (из persistent storage)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted || authEventSeen) return;
      const resolved = await resolveAuthStateAfterDraft(session, bindPrivateDraftToSession);
      if (!mounted || authEventSeen) return;
      setState(resolved);
    });

    // Подписка на изменения — login/logout/token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      void resolveAuthStateAfterDraft(session, bindPrivateDraftToSession).then((resolved) => {
        if (!mounted) return;
        setState(resolved);
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
