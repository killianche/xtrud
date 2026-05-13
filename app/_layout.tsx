import "../global.css";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useRegisterPushToken } from "@/features/notifications/use-register-push-token";

/*
 * RootLayout — корень приложения.
 *
 * Структура (сверху вниз):
 *   GestureHandlerRootView (RNGH требование)
 *   └─ QueryClientProvider
 *      └─ SafeAreaProvider
 *         └─ AuthGate          ← маршрутизация по auth-state
 *            └─ <Slot />        ← дочерние группы маршрутов
 *
 * Авторизация — **анонимный доступ к (tabs)** разрешён по дизайну (PRODUCT_CONTEXT.md):
 * клиент должен видеть каталог + карточку мастера БЕЗ логина. Логин запрашивается
 * just-in-time через `<LoginWall>` на действиях (создание заказа, отправка сообщения,
 * оставление отзыва).
 *
 * Шрифт-gate: на native ждём загрузку Inter (Geist на native не доставлен, fallback).
 *             На web рендерим сразу — там Geist + Inter через @font-face подгружаются
 *             браузером лениво и не блокируют рендер. Это избавляет от SSR-flash null.
 */

// Push-handler регистрируется в src/features/notifications/use-register-push-token
// при первом маунте хука. Этот файл не должен импортировать expo-notifications
// на верхнем уровне — Metro подтягивает модуль в bundle, что на web может ломать
// гидрацию (нативные нативные модули, имеющие side-effects на import).

// Splash hide отложен до загрузки шрифтов (только native).
SplashScreen.preventAutoHideAsync().catch(() => {
  /* web noop */
});

/**
 * AuthGate — маршрутизация по auth-state.
 *
 * Группы маршрутов:
 *   - (auth)        — экраны логина (phone/verify). Если уже залогинен → /(tabs).
 *   - (onboarding)  — пост-логин, до onboarding_completed_at IS NULL.
 *   - (tabs)        — публичные tabs (главная, категории, карточка мастера).
 *                     Доступны АНОНУ. Personal экраны (orders/chats/profile) сами
 *                     показывают LoginWall если нет сессии.
 *
 * Логика:
 *   - Анон в (tabs)       → ✅ пропускаем (новое поведение)
 *   - Анон в (auth)       → ✅ показываем форму логина
 *   - Анон где-то ещё     → редирект в (tabs) (не в (auth) — это too aggressive)
 *   - Логин + не онбордил → редирект в (onboarding)
 *   - Логин в (auth)      → редирект в (tabs)
 *   - Логин онбордил везде → как есть
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: userRecord, isLoading: userLoading } = useUserRecord(userId);

  useRegisterPushToken(userId ?? null);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    const group = segments[0] as string | undefined;
    const inAuth = group === "(auth)";
    const inOnboarding = group === "(onboarding)";
    const inTabs = group === "(tabs)";

    // ============ АНОН ============
    if (status === "unauthenticated") {
      // Анон в (tabs) или (auth) — пропускаем.
      // Анон в (onboarding) — невозможно без сессии, отправляем в (tabs).
      if (inTabs || inAuth) return;
      if (inOnboarding) {
        router.replace("/(tabs)");
        return;
      }
      // Любая нерасклассифицированная страница для анона → главная.
      router.replace("/(tabs)");
      return;
    }

    // ============ ЗАЛОГИНЕН ============
    if (userLoading) return;

    if (!userRecord) {
      // Сессия есть, но запись users не создалась (триггер handle_new_auth_user
      // должен был её сделать). Не редиректим, чтобы не зациклить.
      // TODO: показать toast «не удалось загрузить профиль, попробуйте позже».
      return;
    }

    const onboardingDone = userRecord.onboarding_completed_at !== null;

    // Залогинен в (auth) — отправляем туда куда положено.
    if (inAuth) {
      if (!onboardingDone) {
        router.replace("/(onboarding)/role");
      } else {
        router.replace("/(tabs)");
      }
      return;
    }

    // Не онбордил — отправляем в (onboarding), кроме (tabs) (анонимный просмотр OK).
    if (!onboardingDone && !inOnboarding && !inTabs) {
      router.replace("/(onboarding)/role");
    }
    // Иначе — оставляем где есть.
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

  // На native ждём шрифты (избегаем flash без шрифтов).
  // На web SSR — рендерим сразу. CSS @font-face подхватит Geist+Inter из global.css.
  if (Platform.OS !== "web" && !fontsLoaded && !fontsError) {
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
