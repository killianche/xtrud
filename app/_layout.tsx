import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { needsMasterFinalization } from "@/features/auth/master-onboarding-recovery";
import { isPublicDetailsRoute } from "@/features/auth/public-route-policy";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useMasterOnboardingStatus } from "@/features/auth/use-master-onboarding-status";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useRegisterPushToken } from "@/features/notifications/use-register-push-token";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { installGlobalErrorHandlers } from "@/lib/error-reporting";
import { NavHistoryTracker } from "@/lib/nav-history";
import { isNetworkTransportError } from "@/lib/network-transport-error";
import { initSentry } from "@/lib/sentry";
import { useThemeColor } from "@/lib/use-theme-color";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

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
 * Шрифт: системный (SF Pro / Segoe / Roboto) — грузить нечего, поэтому
 *        шрифт-gate убран (2026-05-23). Старт мгновенный на всех платформах.
 */

// Push-handler регистрируется в src/features/notifications/use-register-push-token
// при первом маунте хука. Этот файл не должен импортировать expo-notifications
// на верхнем уровне — Metro подтягивает модуль в bundle, что на web может ломать
// гидрацию (нативные нативные модули, имеющие side-effects на import).

// Отслеживание сбоев. Включается только при наличии EXPO_PUBLIC_SENTRY_DSN,
// иначе безопасный no-op (см. src/lib/sentry.ts). Вызываем как можно раньше —
// до рендера, чтобы ловить ошибки уже на старте.
initSentry();

// Собственный журнал ошибок (client_errors в Supabase) + перехват необработанных
// исключений: в release без перехвата ошибка в onPress закрывала приложение
// (жалоба пользователя 2026-06-11 «нажал кнопку — выкинуло»). Теперь ошибка
// уходит в журнал, приложение продолжает работать. См. src/lib/error-reporting.ts.
installGlobalErrorHandlers();

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
  const {
    data: masterStatus,
    isLoading: masterStatusLoading,
    isError: masterStatusError,
  } = useMasterOnboardingStatus(userId, userRecord?.is_master === true);

  useRegisterPushToken(userId ?? null);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    const group = segments[0] as string | undefined;
    const inAuth = group === "(auth)";
    const inOnboarding = group === "(onboarding)";
    const inTabs = group === "(tabs)";
    // Only explicit marketplace routes are public. New details fail closed;
    // profile/settings/history/edit/admin never inherit anonymous access.
    const inPublicDetails = isPublicDetailsRoute(segments);
    // /legal/* — Privacy Policy / Terms of Service. Доступны всем без auth
    // (Apple/Google review проверяет ссылку из App Store description, должна
    // открываться без логина). Пропускаем во всех ветках allowlist'ом.
    const inLegal = group === "legal";
    // /reset-password — top-level экран установки нового пароля по ссылке из
    // письма. Открывается с recovery-сессией (залогинен) ИЛИ ещё анонимно (пока
    // Supabase подхватывает токен из URL). Пропускаем во всех ветках, иначе
    // AuthGate выбросит пользователя со страницы до смены пароля.
    const inReset = group === "reset-password";

    // ============ АНОН ============
    if (status === "unauthenticated") {
      // Анон в (tabs) / (auth) / legal / reset-password — пропускаем.
      // Анон в (onboarding) — невозможно без сессии, отправляем в (tabs).
      if (inTabs || inAuth || inPublicDetails || inLegal || inReset) return;
      if (inOnboarding) {
        router.replace("/(tabs)");
        return;
      }
      // Любая нерасклассифицированная страница для анона → главная.
      router.replace("/(tabs)");
      return;
    }

    // ============ ЗАЛОГИНЕН ============
    if (userLoading || (userRecord?.is_master && (masterStatusLoading || masterStatusError))) {
      return;
    }

    if (!userRecord) {
      // Сессия есть, но запись users не создалась (триггер handle_new_auth_user
      // должен был её сделать). Не редиректим, чтобы не зациклить.
      // TODO: показать toast «не удалось загрузить профиль, попробуйте позже».
      return;
    }

    const onboardingDone = userRecord.onboarding_completed_at !== null;
    const mustFinishMasterOnboarding = needsMasterFinalization(userRecord.is_master, masterStatus);
    const performerOnboardingRequested = useAuthReturnUrlStore
      .getState()
      .isPerformerOnboardingRequested();

    // Crash/network recovery: legacy RPC and profile publication are two
    // commits. A durable draft/pending status keeps the user in the last step
    // until retry completes instead of silently releasing a broken master.
    if (mustFinishMasterOnboarding && !inOnboarding) {
      router.replace("/(onboarding)/master-photo");
      return;
    }

    // Залогинен в (auth) — отправляем туда куда положено.
    // Экран выбора роли /role удалён (2026-06-06): новый пользователь по
    // умолчанию клиент, сразу на ввод имени → в приложение. Мастером становятся
    // позже через «Хочу стать мастером» в профиле (→ master-categories).
    if (inAuth) {
      if (performerOnboardingRequested) {
        if (userRecord.is_master) {
          const destination = useAuthReturnUrlStore.getState().consumeReturnUrl();
          router.replace((destination ?? "/(tabs)") as never);
        } else {
          router.replace("/(onboarding)/master-profile");
        }
      } else if (!onboardingDone) {
        router.replace("/(onboarding)/client-name");
      } else {
        router.replace("/(tabs)");
      }
      return;
    }

    // Не онбордил — отправляем на ввод имени, кроме (tabs), legal и reset-password
    // (Privacy/Terms и смена пароля должны открываться на любом этапе).
    if (!onboardingDone && !inOnboarding && !inTabs && !inPublicDetails && !inLegal && !inReset) {
      router.replace("/(onboarding)/client-name");
    }
    // Иначе — оставляем где есть.
  }, [
    status,
    userLoading,
    userRecord,
    masterStatus,
    masterStatusLoading,
    masterStatusError,
    segments,
    router,
  ]);

  const unauthenticatedPrivateDetails =
    status === "unauthenticated" && segments[0] === "(details)" && !isPublicDetailsRoute(segments);

  // Prevent a one-frame render of settings/edit/history while the redirect
  // effect moves an anonymous cold deep link back to the public tabs.
  return unauthenticatedPrivateDetails ? null : children;
}

export default function RootLayout() {
  const canvasColor = useThemeColor("canvas");
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // Транспортный сбой (нет сети, сервер молчит и запрос отвалился по
            // таймауту) повторять бессмысленно: связи не будет и через 20 с, а
            // человек всё это время смотрит на скелетон. Такой сбой показываем
            // сразу — экран покажет «нет связи» с кнопкой «Повторить».
            // Ошибки сервера (5xx, разрыв) по-прежнему повторяем дважды.
            retry: (failureCount, error) => !isNetworkTransportError(error) && failureCount < 2,
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
    // Системный шрифт не требует загрузки — прячем splash сразу после маунта.
    SplashScreen.hideAsync().catch(() => {
      /* web noop */
    });
  }, []);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          {/* initialMetrics обязателен: без него SafeAreaContext держит insets
              равными null и НЕ РЕНДЕРИТ дерево вообще, пока не придёт нативное
              событие вставок — это лишний пустой кадр на каждом холодном
              старте. initialWindowMetrics доступен синхронно. */}
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <AuthGate>
              <NavHistoryTracker />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: "slide_from_right",
                  gestureEnabled: true,
                  contentStyle: { backgroundColor: canvasColor },
                }}
              >
                <Stack.Screen
                  name="(tabs)"
                  options={{ animation: "none", gestureEnabled: false }}
                />
                <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
              </Stack>
            </AuthGate>
            <StatusBar style="auto" />
          </SafeAreaProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
