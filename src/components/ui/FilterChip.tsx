/**
 * FilterChip — кнопка фильтра в закреплённой строке под поиском.
 *
 * DECISION владельца 2026-09-06: «фильтры при поиске заданий и специалистов —
 * как в последнем iOS: приёмы, иконки, шрифты». У Apple лёгкая фильтрация
 * живёт строкой под полем поиска (WWDC26 «Design intuitive search
 * experiences»: scope bar и filter rows), а подробный выбор — в системной
 * шторке с галочками. Этот чип — элемент такой строки.
 *
 * Правила:
 *  - капсула 44 pt (тач-цель), текст 16, иконка 17 — как у чипов iOS 26;
 *  - лежит на стеклянной панели, поэтому со своей заливкой (стекло на стекле
 *    Apple не советует);
 *  - «применён» — фирменный цвет, не чёрная заливка; активный чип показывает
 *    выбранное значение («Сантехника +2»), а не слово «Категория»;
 *  - справа маленькая стрелка вниз: чип открывает выбор, а не переключает.
 */

import { CaretDown } from "phosphor-react-native";
import { Pressable } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
import { SystemIcon } from "./SystemIcon";

export interface FilterChipProps {
  label: string;
  Icon?: IconComponent;
  active: boolean;
  onPress: () => void;
  /** Подпись для VoiceOver, если отличается от label. */
  accessibilityLabel?: string;
}

export function FilterChip({ label, Icon, active, onPress, accessibilityLabel }: FilterChipProps) {
  const tc = useThemeColors(["accent", "body", "mute"]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className={`h-11 flex-row items-center gap-1.5 rounded-pill pl-4 pr-3 active:opacity-60 ${
        active ? "border border-accent bg-accent-soft" : "border border-hairline bg-canvas-soft"
      }`}
    >
      {Icon ? <Icon size={17} weight="bold" color={active ? tc.accent : tc.body} /> : null}
      <AppText
        weight="semibold"
        className={`text-ios-callout ${active ? "text-accent" : "text-body"}`}
        numberOfLines={1}
      >
        {label}
      </AppText>
      <SystemIcon
        sf="chevron.down"
        fallback={CaretDown}
        size={12}
        weight="semibold"
        color={active ? tc.accent : tc.mute}
      />
    </Pressable>
  );
}
