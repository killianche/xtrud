/**
 * Стек вкладки «Найти задание».
 *
 * Новый вид (2026-09-17, как у Apple в iOS 26): системная шапка с крупным
 * заголовком, системная строка поиска (в iOS 26 — внизу, над панелью) и
 * системные меню справа; раздел — отдельный экран с «назад».
 * Прежний вид (флаг find_screen = classic в админке) — без системной шапки,
 * экран рисует свою.
 */

import { Stack } from "expo-router";
import { useAppFlags } from "@/features/app-flags/use-app-flags";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindStackLayout() {
  const { findScreen } = useAppFlags();
  const tc = useThemeColors(["canvas", "surface-page", "ink", "accent"]);
  const classic = findScreen === "classic";

  if (classic) {
    return (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tc.canvas } }}>
        <Stack.Screen name="index" options={{ animation: "none" }} />
        <Stack.Screen name="category" options={{ headerShown: true, title: "" }} />
      </Stack>
    );
  }

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
      <Stack.Screen name="category" options={{ title: "" }} />
    </Stack>
  );
}
