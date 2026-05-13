// useThemeColor — возвращает hex-значение токена для текущей темы.
//
// Использование (на Lucide-иконках, placeholderTextColor, любых color={"#..."}):
//   const ink = useThemeColor("ink");
//   <ChevronLeft color={ink} />
//
// Хук подписан на NativeWind colorScheme через src/hooks/use-color-scheme.
// На web SSR initial render colorScheme может быть null — читаем html.dark класс
// синхронно из DOM, чтобы не мигать светлыми цветами в тёмной теме.

import { Platform } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type ColorToken, darkColors, lightColors } from "@/lib/colors";

/**
 * Синхронно определяет тему по классу html.dark (только web).
 * Используется как фолбэк когда useNativeWindColorScheme() ещё не успел
 * прочитать preference из localStorage (начальный рендер).
 */
function resolveWebScheme(): "dark" | "light" {
  if (
    Platform.OS === "web" &&
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  ) {
    return "dark";
  }
  return "light";
}

export function useThemeColor(token: ColorToken): string {
  const { colorScheme } = useColorScheme();
  // colorScheme === null на первом рендере — фолбэк на DOM-класс (web) или light (native).
  const effectiveScheme = colorScheme ?? resolveWebScheme();
  const palette = effectiveScheme === "dark" ? darkColors : lightColors;
  return palette[token];
}

/**
 * Хук-батч: возвращает несколько токенов разом одним хуком, без двойной подписки.
 * Удобнее когда в компоненте нужны 3-5 токенов:
 *   const { ink, muted, hairline } = useThemeColors(["ink", "muted", "hairline"]);
 */
export function useThemeColors<T extends ColorToken>(tokens: readonly T[]): Record<T, string> {
  const { colorScheme } = useColorScheme();
  // colorScheme === null на первом рендере — фолбэк на DOM-класс (web) или light (native).
  const effectiveScheme = colorScheme ?? resolveWebScheme();
  const palette = effectiveScheme === "dark" ? darkColors : lightColors;
  const result = {} as Record<T, string>;
  for (const token of tokens) {
    result[token] = palette[token];
  }
  return result;
}
