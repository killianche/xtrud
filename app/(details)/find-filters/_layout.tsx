/**
 * Шторка «Фильтры» вкладки «Найти задание» (№235): свой стек внутри
 * системной шторки — вложенные экраны открываются со свайпом «назад», вся
 * шторка закрывается свайпом вниз или «Готово». Презентация (modal) задана
 * в корневом стеке (app/_layout.tsx).
 */

import { Stack } from "expo-router";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindFiltersLayout() {
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
