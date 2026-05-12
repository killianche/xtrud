import "../global.css";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useRegisterPushToken } from "@/features/notifications/use-register-push-token";

// Глобальный handler — показывать push даже когда app в foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Не скрывать splash до загрузки шрифтов + резолва auth-сессии.
SplashScreen.preventAutoHideAsync().catch(() => {
  // На web метод noop / может выбросить — игнорируем.
});

/**
 * Protected route gate.
 * 3 группы маршрутов:
 *   - (auth)         — без сессии
 *   - (onboarding)   — с сессией, но onboarding_completed_at IS NULL
 *   - (tabs)         — с сессией и завершённым онбордингом
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: userRecord, isLoading: userLoading } = useUserRecord(userId);

  // Регистрируем Expo push token для авторизованных пользователей.
  useRegisterPushToken(userId ?? null);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    const group = segments[0] as string | undefined;
    const inAuth = group === "(auth)";
    const inOnboarding = group === "(onboarding)";
    const inTabs = group === "(tabs)";

    // Нет сессии — должен быть в (auth)
    if (status === "unauthenticated") {
      if (!inAuth) router.replace("/(auth)/phone");
      return;
    }

    // Авторизован, но user record ещё грузится — ждём
    if (userLoading) return;

    // Edge case: сессия есть, но запись users не дотянулась (NULL).
    // Триггер handle_new_auth_user должен был её создать. Если нет — что-то сломано.
    // Не редиректим, чтобы не зациклить. Логируем и оставляем как есть.
    if (!userRecord) {
      // Возможен race condition сразу после signInAnonymously — записываем диагностику.
      // В sprint 3 добавим toast/retry.
      return;
    }

    const onboardingDone = userRecord.onboarding_completed_at !== null;

    if (!onboardingDone) {
      if (!inOnboarding) router.replace("/(onboarding)/role");
      return;
    }

    // Онбординг пройден — отправляем в /(tabs) если в (auth) или (onboarding)
    if (inAuth || inOnboarding || (!inTabs && !inAuth && !inOnboarding)) {
      router.replace("/(tabs)");
    }
  }, [status, userLoading, userRecord, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync().catch(() => {
        /* web noop */
      });
    }
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AuthGate>
            <Slot />
          </AuthGate>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
