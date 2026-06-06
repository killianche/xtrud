import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { PhoneFrame } from "@/components/PhoneFrame";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useRegisterPushToken } from "@/features/notifications/use-register-push-token";
import { NavHistoryTracker } from "@/lib/nav-history";
import { initSentry } from "@/lib/sentry";

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
      if (inTabs || inAuth || inLegal || inReset) return;
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
    // Экран выбора роли /role удалён (2026-06-06): новый пользователь по
    // умолчанию клиент, сразу на ввод имени → в приложение. Мастером становятся
    // позже через «Хочу стать мастером» в профиле (→ master-categories).
    if (inAuth) {
      if (!onboardingDone) {
        router.replace("/(onboarding)/client-name");
      } else {
        router.replace("/(tabs)");
      }
      return;
    }

    // Не онбордил — отправляем на ввод имени, кроме (tabs), legal и reset-password
    // (Privacy/Terms и смена пароля должны открываться на любом этапе).
    if (!onboardingDone && !inOnboarding && !inTabs && !inLegal && !inReset) {
      router.replace("/(onboarding)/client-name");
    }
    // Иначе — оставляем где есть.
  }, [status, userLoading, userRecord, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
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
    // Системный шрифт не требует загрузки — прячем splash сразу после маунта.
    SplashScreen.hideAsync().catch(() => {
      /* web noop */
    });
  }, []);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <AuthGate>
              <NavHistoryTracker />
              <PhoneFrame>
                <Slot />
              </PhoneFrame>
            </AuthGate>
            <StatusBar style="auto" />
          </SafeAreaProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
