/**
 * VerifiedBadge — знак проверенного специалиста: паспорт подтверждён
 * администратором (master_profiles.verification_level >= 2, миграция 0174).
 * Рисуется только по факту из базы — пустое поле значка не даёт.
 */

import { SealCheck } from "phosphor-react-native";
import { View } from "react-native";
import { useThemeColors } from "@/lib/use-theme-color";
import { SystemIcon } from "./SystemIcon";

export const VERIFIED_LEVEL = 2;

export function isVerifiedLevel(level: number | null | undefined): boolean {
  return (level ?? 0) >= VERIFIED_LEVEL;
}

export function VerifiedBadge({ size = 18 }: { size?: number }) {
  const tc = useThemeColors(["accent"]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Проверенный специалист">
      <SystemIcon
        sf="checkmark.seal.fill"
        fallback={SealCheck}
        size={size}
        weight="regular"
        color={tc.accent}
      />
    </View>
  );
}
