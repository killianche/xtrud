// OnboardingProgress — горизонтальный индикатор прогресса по визарду.
//
// Cal.com-стиль: одна тонкая полоса, разделённая на N сегментов.
// Пройденные (step-1 и меньше) и текущий — bg-ink, будущие — bg-hairline.
// Справа опциональная ghost-кнопка «Отмена» — escape-hatch из онбординга,
// чтобы юзер не оказался в ловушке (фидбэк user 2026-05-20 «как мне выйти
// из регистрации?»). Реализация выхода — в useExitOnboarding().
//
// Использование:
//   <OnboardingProgress step={2} total={4} />               ← без отмены
//   <OnboardingProgress step={2} total={4} onCancel={fn} /> ← с отменой

import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";

export interface OnboardingProgressProps {
  step: number;
  total: number;
  /**
   * Если передан — справа появится ghost-кнопка «Отмена». Логика выхода
   * (confirm + signOut + redirect) живёт в хуке у вызывающего экрана.
   */
  onCancel?: () => void;
}

export function OnboardingProgress({ step, total, onCancel }: OnboardingProgressProps) {
  return (
    <View className="flex-row items-center gap-3 px-6">
      <View
        className="flex-1 flex-row gap-1.5"
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
      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отменить регистрацию"
          onPress={onCancel}
          hitSlop={8}
          className="active:opacity-60"
        >
          <AppText weight="medium" className="text-caption text-muted">
            Отмена
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
