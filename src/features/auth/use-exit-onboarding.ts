// Hook для выхода из онбординг-визарда.
//
// Проблема. AuthGate в app/_layout.tsx редиректит залогиненного юзера в
// /(onboarding)/role пока onboarding_completed_at IS NULL. То есть в середине
// мастер-визарда нет способа просто «вернуться назад» в /(tabs) — гард
// тут же отправит обратно.
//
// Решение зависит от состояния аккаунта:
// - существующий клиент прерывает настройку исполнителя без logout и
//   возвращается к исходному заданию/в приложение;
// - новый аккаунт выходит, но performer return-intent сохраняется, поэтому
//   следующий login продолжает тот же onboarding;
// - client-name после подтверждённого logout отдельно очищает обычный intent.
//
// confirmAsync — кроссплатформенный (на web — window.confirm, потому что
// нативный Alert.alert на RNW = no-op).

import { useRouter } from "expo-router";
import { useState } from "react";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { signOut } from "@/lib/auth";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { confirmAsync } from "@/lib/confirm";

export function useExitOnboarding() {
  const router = useRouter();
  const { session } = useAuthSession();
  const { data: user } = useUserRecord(session?.user?.id);
  const [isExiting, setIsExiting] = useState(false);

  const exit = async () => {
    if (isExiting) return;
    const existingClient = user?.onboarding_completed_at != null && !user.is_master;
    const confirmed = await confirmAsync({
      title: existingClient ? "Прервать настройку?" : "Выйти из регистрации?",
      message: existingClient
        ? "Сохранённые шаги останутся в профиле. Вы сможете продолжить позже."
        : "Вы выйдете из аккаунта. Сохранённые шаги останутся, и после следующего входа регистрация продолжится.",
      confirmText: existingClient ? "Прервать" : "Выйти",
      cancelText: "Остаться",
      destructive: true,
    });
    if (!confirmed) return;
    setIsExiting(true);
    try {
      if (existingClient) {
        const destination = useAuthReturnUrlStore.getState().consumeReturnUrl();
        router.replace((destination ?? "/(tabs)") as never);
        return;
      }
      await signOut();
      // AuthGate увидит unauthenticated → отправит на /(auth)/phone.
      // Принудительный replace на случай если гард по какой-то причине
      // не сработал.
      router.replace("/(auth)/phone" as never);
    } finally {
      setIsExiting(false);
    }
  };

  return { exit, isExiting };
}
