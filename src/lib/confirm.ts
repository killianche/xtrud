/**
 * confirmAsync — кроссплатформенный confirm-dialog.
 *
 * Проблема. `Alert.alert` из react-native на вебе (RNW) — **no-op**.
 * Кнопка onPress срабатывает, но никакой диалог не показывается, и
 * пользовательский callback (например, signOut) никогда не вызывается.
 * Это типичный симптом «кнопка не работает на сайте» (фидбэк user
 * 2026-05-15: «кнопка выйти из аккаунта тоже не работает»).
 *
 * Решение. На вебе — нативный `window.confirm` (некрасиво, но работает
 * везде, доступно, без лишних состояний). На iOS/Android — стандартный
 * Alert.alert с двумя кнопками. Возвращает Promise<boolean>.
 *
 * Использование:
 *
 *   if (await confirmAsync({ title: "Выйти?", message: "...", confirmText: "Выйти" })) {
 *     await signOut();
 *   }
 *
 * Когда нужно три+ кнопки или сложная логика — оставлять Alert.alert
 * напрямую и держать в уме что на вебе ничего не покажется.
 */

import { Alert, Platform } from "react-native";

export interface ConfirmAsyncOptions {
  title: string;
  message?: string;
  /** Текст подтверждающей кнопки. По умолчанию «ОК». */
  confirmText?: string;
  /** Текст кнопки отмены. По умолчанию «Отмена». */
  cancelText?: string;
  /** Подсветить confirm-кнопку как destructive (только native). */
  destructive?: boolean;
}

export function confirmAsync(opts: ConfirmAsyncOptions): Promise<boolean> {
  const { title, message, confirmText = "ОК", cancelText = "Отмена", destructive } = opts;

  if (Platform.OS === "web") {
    if (typeof window === "undefined") return Promise.resolve(false);
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
