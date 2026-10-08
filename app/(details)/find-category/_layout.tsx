/**
 * Шторка фильтра «Найти задание» (№238) со своим стеком: вложенный экран
 * открывается со свайпом «назад», вся шторка закрывается свайпом вниз или
 * кнопкой. Презентация (modal) — в корневом стеке (app/_layout.tsx).
 */

import { Stack } from "expo-router";

// Опорный экран шторки — список разделов: если открыть сразу подкатегории
// («Уточнить» с выбранным разделом), «Назад» ведёт к разделам, а не
// закрывает шторку (№313). Работает вместе с push(…, { withAnchor: true }).
export const unstable_settings = {
  initialRouteName: "index",
};

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
