/**
 * Шторка фильтра «Найти задание» (№238) со своим стеком: вложенный экран
 * открывается со свайпом «назад», вся шторка закрывается свайпом вниз или
 * кнопкой. Презентация (modal) — в корневом стеке (app/_layout.tsx).
 */

import { Stack } from "expo-router";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FilterSheetLayout() {
  const tc = useThemeColors(["surface-page"]);
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tc["surface-page"] },
      }}
    />
  );
}
