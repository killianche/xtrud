/**
 * AppErrorBoundary — корневой React Error Boundary.
 *
 * P0-22 из LAUNCH_READINESS_2026-05-18.md: без него любой uncaught render-error
 * приводит к **белому экрану** без объяснения. Apple/Google review это очень
 * не любит (stability questions, потенциальный reject).
 *
 * Показывает fallback с кнопкой «Перезагрузить» И отправляет ошибку в Sentry
 * (отслеживание сбоев) через reportError. Sentry включается только при наличии
 * EXPO_PUBLIC_SENTRY_DSN — без ключа reportError тихий no-op (см. src/lib/sentry.ts).
 *
 * Не использует hooks (Error Boundary в React работает только через class).
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { reportClientError } from "@/lib/error-reporting";
import { reportError } from "@/lib/sentry";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Отправляем ошибку в Sentry (no-op без DSN). Так мы узнаём о белых экранах
    // у реальных пользователей, а не из жалоб.
    reportError(error, { componentStack: info?.componentStack });
    // Дублируем в собственный журнал client_errors (Supabase) — он работает
    // ВСЕГДА, независимо от Sentry DSN. fatal=true: render-ошибка валит экран.
    reportClientError(error, { fatal: true, context: "error-boundary" });
    // Дублируем в консоль: на web — для браузерных devtools, на native — в Metro.
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
    }
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-canvas px-8">
          <AppText weight="bold" className="text-display-sm text-ink text-center">
            Что-то пошло не так
          </AppText>
          <AppText className="mt-3 text-body-md text-mute text-center">
            Приложение столкнулось с ошибкой и не может продолжить. Попробуйте
            перезагрузить.
          </AppText>
          <AppText
            weight="mono"
            className="mt-4 text-mono-caption text-muted-soft text-center"
            numberOfLines={3}
          >
            {this.state.error.message || String(this.state.error)}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={this.reset}
            className="mt-8 h-12 items-center justify-center rounded-md bg-primary px-6 active:opacity-80"
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              Перезагрузить
            </AppText>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
