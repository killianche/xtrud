/**
 * Подпись раздела формы и капсулы-варианты — для компактных выборов прямо на
 * форме задания (№260): срок, бюджет. Капсула — 44 pt в высоту (цель касания
 * iOS), выбранная — в фирменном цвете, как дни в `DateStrip`.
 */

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { hapticSelection } from "@/lib/haptics";

/** Подпись над разделом — тот же вид, что подпись поля (`ComposerField`). */
export function FormSectionLabel({ children }: { children: string }) {
  return (
    <AppText
      accessibilityRole="header"
      className="mb-1.5 ml-8 text-ios-footnote uppercase text-mute"
    >
      {children}
    </AppText>
  );
}

export function OptionPill({
  label,
  selected,
  onPress,
  icon,
  grow = false,
  tall = false,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  /** Растянуть на свободную ширину строки. */
  grow?: boolean;
  /** Высота поля ввода (56 pt) — когда капсула стоит в строке с полем. */
  tall?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      className={`flex-row items-center justify-center gap-1.5 px-4 ${
        tall ? "min-h-14 rounded-2xl" : "min-h-11 rounded-full"
      } ${grow ? "flex-1" : ""} ${selected ? "bg-accent" : "bg-surface-card active:opacity-70"}`}
    >
      {icon}
      <AppText
        weight={selected ? "semibold" : "regular"}
        className={`text-ios-body ${selected ? "text-on-accent" : "text-ink"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/** Ряд капсул с переносом — варианты не прячутся за краем экрана. */
export function OptionPillRow({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2 px-4">
      {children}
    </View>
  );
}
