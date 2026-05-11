// Hook для подписки на состояние сессии Supabase.
// Используется в protected route gate в app/_layout.tsx.

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthSessionState {
  session: Session | null;
  status: AuthStatus;
}

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    session: null,
    status: "loading",
  });

  useEffect(() => {
    let mounted = true;

    // Подгружаем текущую сессию (из persistent storage)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setState({
        session,
        status: session ? "authenticated" : "unauthenticated",
      });
    });

    // Подписка на изменения — login/logout/token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({
        session,
        status: session ? "authenticated" : "unauthenticated",
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
