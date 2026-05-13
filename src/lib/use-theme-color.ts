// useThemeColor — возвращает hex-значение токена для текущей темы.
//
// Использование (на Lucide-иконках, placeholderTextColor, любых color={"#..."}):
//   const ink = useThemeColor("ink");
//   <ChevronLeft color={ink} />
//
// Резолв темы — один источник: `useColorScheme()` (см. src/hooks/use-color-scheme).
// На web SSR-race устранён inline theme-guard в `app/+html.tsx`, который ставит
// класс `dark` на <html> ДО первого рендера. Поэтому здесь больше нет DOM-фолбэков
// и matchMedia-резолвов — все они жили только для обхода того бага.

import { useColorScheme } from "@/hooks/use-color-scheme";
import { type ColorToken, darkColors, lightColors } from "@/lib/colors";

export function useThemeColor(token: ColorToken): string {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  return palette[token];
}

/**
 * Хук-батч: возвращает несколько токенов разом одним хуком, без двойной подписки.
 * Удобнее когда в компоненте нужны 3-5 токенов:
 *   const { ink, muted, hairline } = useThemeColors(["ink", "muted", "hairline"]);
 */
export function useThemeColors<T extends ColorToken>(tokens: readonly T[]): Record<T, string> {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const result = {} as Record<T, string>;
  for (const token of tokens) {
    result[token] = palette[token];
  }
  return result;
}
