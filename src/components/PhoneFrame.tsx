/**
 * PhoneFrame — телефонная рамка для web.
 *
 * Решение владельца 2026-05-21: сайт всегда в телефонном виде. На широком
 * web-окне зажимаем приложение в колонку ≤ PHONE_MAX_WIDTH по центру, по бокам —
 * нейтральный фон (как телефон на столе). На реальном телефоне / узком окне
 * (ширина ≤ PHONE_MAX_WIDTH) и на native — рамка не вмешивается, контент во всю
 * ширину.
 *
 * Логику раскладок (грид-колонки, isDesktop) синхронно зажимает useAppWidth()
 * — см. src/lib/use-app-width.ts. Вместе они дают консистентный телефонный вид.
 */

import { Platform, useWindowDimensions, View } from "react-native";
import { PHONE_MAX_WIDTH } from "@/lib/use-app-width";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const clamp = Platform.OS === "web" && width > PHONE_MAX_WIDTH;

  if (!clamp) return <>{children}</>;

  return (
    <View className="flex-1 items-center bg-canvas-soft-2">
      <View
        className="h-full w-full border-x border-hairline bg-canvas"
        style={{ maxWidth: PHONE_MAX_WIDTH }}
      >
        {children}
      </View>
    </View>
  );
}
