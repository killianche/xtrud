/**
 * ExperienceBadge — плашка «Большой опыт»: админ отметил опыт специалиста
 * (master_profiles.experience_badge_at, 0225; владелец, 2026-10-05: выдаём по
 * своему решению, бесплатно, бессрочно, без чисел — годы и объекты человек
 * пишет сам). Рисуется только по факту из базы.
 *
 * Подписанная плашка, а не вторая иконка у имени: у имени один знак —
 * «Паспорт проверен», иначе значки перестают что-то значить.
 */

import { Medal } from "phosphor-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import { SystemIcon } from "./SystemIcon";

export function ExperienceBadge({ compact = false }: { compact?: boolean }) {
  const tc = useThemeColors(["accent"]);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Большой опыт — отмечено xtrud"
      className={`flex-row items-center gap-1 self-start rounded-full bg-accent-soft ${
        compact ? "px-2 py-0.5" : "px-2.5 py-1"
      }`}
    >
      <SystemIcon
        sf="rosette"
        fallback={Medal}
        size={compact ? 13 : 15}
        weight="semibold"
        color={tc.accent}
      />
      <AppText
        weight="semibold"
        className={`${compact ? "text-ios-caption1" : "text-ios-footnote"} text-accent`}
      >
        Большой опыт
      </AppText>
    </View>
  );
}
