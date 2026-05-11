// Обёртка над <Text> с фиксированным maxFontSizeMultiplier=1.3.
// CROSS_PLATFORM_RULES §3: ограничиваем accessibility-масштабирование шрифтов,
// чтобы Dynamic Type iOS / Font Scale Android не разламывали вёрстку.
//
// Использовать ВЕЗДЕ вместо raw <Text>. Линт-правило на запрет raw <Text> добавляем позже.

import { forwardRef } from "react";
import { Text, type TextProps } from "react-native";

export const AppText = forwardRef<Text, TextProps>(function AppText(props, ref) {
  return <Text ref={ref} maxFontSizeMultiplier={1.3} {...props} />;
});
