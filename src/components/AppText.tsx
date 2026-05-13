// AppText — обёртка над `<Text>` с правильным шрифтом + Dynamic Type фиксом.
//
// Дизайн-система Vercel-based (DESIGN.md): один шрифт Geist для всех весов.
//
// На web:    fontFamily = "Geist" (variable font, weight 100-900 в одном файле),
//            fontWeight задаётся числом → браузер сам выбирает нужный stroke.
//            Geist подгружается через @font-face в global.css (jsdelivr CDN).
// На native: пока fallback на Inter (`Inter_400Regular`, ..., `Inter_700Bold`),
//            потому что Geist в @expo-google-fonts нет.
//            После `npm install geist` + native font register можно перевести.
//
// `weight="display"` исторически = семейство display-шрифта. В новой системе
// display — это тот же Geist, просто semibold (600). Оставляем prop для совместимости
// и читаемости вызовов: `<AppText weight="display">Hero</AppText>`.
//
// `weight="mono"` (новый) — Geist Mono для метрик в карточках (★ 4.9, цена, расстояние).
// xtrud override из DESIGN.md.
//
// Использование:
//   <AppText>Обычный текст</AppText>                            — Geist 400
//   <AppText weight="semibold">Полужирный</AppText>             — Geist 600
//   <AppText weight="display" className="text-display-lg">Hero</AppText>  — Geist 600 на display-шкале
//   <AppText weight="mono" className="text-mono-sm">★ 4.9</AppText>       — Geist Mono 500

import { forwardRef } from "react";
import { Platform, Text, type TextProps } from "react-native";

export type AppTextWeight = "regular" | "medium" | "semibold" | "bold" | "display" | "mono";

const fontWeightMap: Record<AppTextWeight, "400" | "500" | "600" | "700"> = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  display: "600",
  mono: "500",
};

// На native — фиксированные fontFamily-имена (так expo-font регистрирует weights).
const nativeFontFamilyMap: Record<AppTextWeight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  display: "Inter_700Bold", // fallback до установки Geist native
  mono: "Inter_500Medium", // fallback — нет native Geist Mono
};

export interface AppTextProps extends TextProps {
  weight?: AppTextWeight;
}

export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  { weight = "regular", style, ...props },
  ref,
) {
  const fontStyle =
    Platform.OS === "web"
      ? {
          // Variable font — одно семейство, разные веса через fontWeight.
          fontFamily:
            weight === "mono"
              ? '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
              : '"Geist", "Inter", system-ui, sans-serif',
          fontWeight: fontWeightMap[weight] as "400",
        }
      : { fontFamily: nativeFontFamilyMap[weight] };

  return <Text ref={ref} maxFontSizeMultiplier={1.3} style={[fontStyle, style]} {...props} />;
});
