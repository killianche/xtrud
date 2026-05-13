// useThemeColor — возвращает токен-цвет для текущей темы.
//
// АРХИТЕКТУРНОЕ РЕШЕНИЕ (2026-05-13):
//   На web возвращаем CSS-var строку — `rgb(var(--ink))` — а не резолвленный hex.
//   Браузер резолвит сам по текущему html.dark классу из inline theme-guard'a в
//   `app/+html.tsx`. Это полностью убирает проблему "JS не знает тему на первом
//   рендере / SSR" — CSS-var это единый источник истины, и для JS, и для CSS.
//
//   На native — резолвим в hex через `useColorScheme()` + палитру (там CSS-vars
//   не работают, нужен прямой hex).
//
// Использование (одинаковое на всех платформах):
//   const ink = useThemeColor("ink");
//   <ChevronLeft color={ink} />                  // ← на web: rgb(var(--ink)), на native: #0a0a0a / #fafafa
//   <View style={{ backgroundColor: ink }}>      // ← одинаково работает
//
// Tailwind className остаётся приоритетным выбором для web — он короче и читаемее.
// Но если нужен inline style (Lucide color, expo-image bg, placeholderTextColor),
// этот хук даёт безопасный путь.

import { Platform } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type ColorToken, darkColors, lightColors } from "@/lib/colors";

export function useThemeColor(token: ColorToken): string {
  if (Platform.OS === "web") {
    return `rgb(var(--${token}))`;
  }
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  return palette[token];
}

/**
 * Хук-батч: возвращает несколько токенов разом одним хуком.
 *   const { ink, mute, hairline } = useThemeColors(["ink", "mute", "hairline"]);
 */
export function useThemeColors<T extends ColorToken>(tokens: readonly T[]): Record<T, string> {
  if (Platform.OS === "web") {
    const result = {} as Record<T, string>;
    for (const token of tokens) {
      result[token] = `rgb(var(--${token}))`;
    }
    return result;
  }
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const result = {} as Record<T, string>;
  for (const token of tokens) {
    result[token] = palette[token];
  }
  return result;
}
