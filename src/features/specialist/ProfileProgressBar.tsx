/**
 * ProfileProgressBar — горизонтальная полоса заполненности профиля
 * специалиста: нейтральный фон (`bg-hairline`), заполненная часть —
 * `bg-accent`. Общий компонент для карточки на главной
 * (`SpecialistProfileNudge`) и индикатора на вкладке профиля (`AccountBody`)
 * — одна реализация бара, не две (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §4).
 */

import { View } from "react-native";

export function ProfileProgressBar({
  doneCount,
  total,
  /** На главной бар декоративный — смысл уже в label всей карточки. */
  hideFromAccessibility = false,
}: {
  doneCount: number;
  total: number;
  hideFromAccessibility?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (doneCount / total) * 100)) : 0;
  return (
    <View
      className="h-2 w-full overflow-hidden rounded-full bg-hairline"
      {...(hideFromAccessibility
        ? {
            accessibilityElementsHidden: true,
            importantForAccessibility: "no-hide-descendants" as const,
          }
        : {
            accessibilityRole: "progressbar" as const,
            accessibilityValue: { min: 0, max: total, now: doneCount },
            accessibilityLabel: `Заполнено ${doneCount} из ${total}`,
          })}
    >
      <View className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </View>
  );
}
