// OnboardingProgress — горизонтальный индикатор прогресса по визарду.
//
// Cal.com-стиль: одна тонкая полоса, разделённая на N сегментов.
// Пройденные (step-1 и меньше) и текущий — bg-ink, будущие — bg-hairline.
// Без подписей, без номеров — минимализм (принцип №1 DESIGN.md).
//
// Использование:
//   <OnboardingProgress step={2} total={4} />   ← на 2-м из 4 шагов
//
// Шаги нумеруются с 1.

import { View } from "react-native";

export interface OnboardingProgressProps {
  step: number;
  total: number;
}

export function OnboardingProgress({ step, total }: OnboardingProgressProps) {
  return (
    <View
      className="flex-row gap-1.5 px-6"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: step }}
      accessibilityLabel={`Шаг ${step} из ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <View
          // Индекс позиции, не значение — порядок сегментов фиксирован.
          // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
          key={i}
          className={`h-1 flex-1 rounded-full ${i < step ? "bg-ink" : "bg-hairline"}`}
        />
      ))}
    </View>
  );
}
