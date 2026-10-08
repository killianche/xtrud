/**
 * CompanyBadge — знак «Компания подтверждена» (0245, №308): заявку компании
 * (Instagram, WhatsApp) проверил администратор. Отдельно от галочки
 * «Личность подтверждена» (паспорт) — две разные проверки, два знака.
 * Рисуется только по факту из базы (company_verified_at).
 */

import { SealCheck } from "phosphor-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

export function CompanyBadge({ compact = false }: { compact?: boolean }) {
  const tc = useThemeColors(["accent"]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Компания подтверждена"
      className="flex-row items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5"
    >
      <SealCheck size={compact ? 13 : 15} weight="fill" color={tc.accent} />
      <AppText
        weight="semibold"
        className={`${compact ? "text-ios-caption1" : "text-ios-footnote"} text-accent`}
      >
        Компания
      </AppText>
    </View>
  );
}
