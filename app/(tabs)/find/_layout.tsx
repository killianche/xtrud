/**
 * Стек вкладки «Найти задание» (docs/FIND_SCREEN_REDESIGN.md §7).
 *
 * index — системная шапка с крупным заголовком: он схлопывается сам при
 * прокрутке, а поиск и фильтры живут внутри списка.
 * filters — обычный экран с «назад»; заголовок рисует ScreenHeader, поэтому
 * системная шапка здесь выключена.
 */

import { Stack } from "expo-router";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindStackLayout() {
  const tc = useThemeColors(["surface-page", "ink", "accent"]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: tc["surface-page"] },
        headerLargeStyle: { backgroundColor: tc["surface-page"] },
        headerTitleStyle: { color: tc.ink },
        headerLargeTitleStyle: { color: tc.ink },
        headerTintColor: tc.accent,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: tc["surface-page"] },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Найти задание", animation: "none" }} />
      <Stack.Screen name="filters" options={{ headerShown: false }} />
    </Stack>
  );
}
