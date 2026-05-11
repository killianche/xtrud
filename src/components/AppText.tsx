// Обёртка над <Text>:
// 1. maxFontSizeMultiplier=1.3 (CROSS_PLATFORM_RULES §3 — фикс iOS Dynamic Type)
// 2. Дефолтный fontFamily — Inter (загруженный в app/_layout через @expo-google-fonts/inter).
// 3. Prop `weight` переключает между 4 загруженными вариантами Inter.
//
// Использование:
//   <AppText className="text-base">Привет</AppText>            — Inter 400
//   <AppText weight="bold" className="text-2xl">Заголовок</AppText> — Inter 700
//
// Использовать ВЕЗДЕ вместо raw <Text>.

import { forwardRef } from "react";
import { Text, type TextProps } from "react-native";

export type AppTextWeight = "regular" | "medium" | "semibold" | "bold";

const fontFamilyMap: Record<AppTextWeight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export interface AppTextProps extends TextProps {
  weight?: AppTextWeight;
}

export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  { weight = "regular", style, ...props },
  ref,
) {
  return (
    <Text
      ref={ref}
      maxFontSizeMultiplier={1.3}
      style={[{ fontFamily: fontFamilyMap[weight] }, style]}
      {...props}
    />
  );
});
