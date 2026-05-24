// Hook для выхода из онбординг-визарда.
//
// Проблема. AuthGate в app/_layout.tsx редиректит залогиненного юзера в
// /(onboarding)/role пока onboarding_completed_at IS NULL. То есть в середине
// мастер-визарда нет способа просто «вернуться назад» в /(tabs) — гард
// тут же отправит обратно.
//
// Решение. «Отмена» в шапке онбординга = полный signOut, после которого
// AuthGate увидит unauthenticated и отправит на /(auth)/phone. С точки зрения
// юзера это «выйти из этой попытки регистрации, попробую другим разом или
// другим номером».
//
// confirmAsync — кроссплатформенный (на web — window.confirm, потому что
// нативный Alert.alert на RNW = no-op).

import { useRouter } from "expo-router";
import { useState } from "react";
import { signOut } from "@/lib/auth";
import { confirmAsync } from "@/lib/confirm";

export function useExitOnboarding() {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  const exit = async () => {
    if (isExiting) return;
    const confirmed = await confirmAsync({
      title: "Выйти из регистрации?",
      message: "Введённые данные не сохранятся.",
      confirmText: "Выйти",
      cancelText: "Остаться",
      destructive: true,
    });
    if (!confirmed) return;
    setIsExiting(true);
    try {
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
