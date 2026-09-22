/**
 * Стек вкладки «Найти задание».
 *
 * Системная шапка выключена на обоих экранах: внутри NativeTabs крупный
 * заголовок нативного стека не отрисовался (сборка 103 — пустое место
 * сверху, FACT со скриншота владельца 2026-09-22). Заголовок рисует тот же
 * useLargeTitle()/LargeTitleBar, что на «Мои» и «Специалисты» — один
 * механизм верха на все вкладки (docs/TAB_TOPS_REDESIGN.md §1–2).
 * На «Фильтры» заголовок рисует ScreenHeader.
 */

import { Stack } from "expo-router";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FindStackLayout() {
  const tc = useThemeColors(["surface-page"]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tc["surface-page"] },
      }}
    >
      <Stack.Screen name="index" options={{ animation: "none" }} />
      <Stack.Screen name="filters" />
    </Stack>
  );
}
