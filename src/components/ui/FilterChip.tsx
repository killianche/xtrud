/**
 * FilterChip — капсула фильтра под поиском: «📍 Вся Ингушетия ▾».
 *
 * Владелец, 2026-10-01: «нормальные клавиши, а не непонятные клавиши с
 * непонятной иконкой». Поэтому фильтр — это подписанная капсула в
 * содержимом экрана, а не круглая кнопка-иконка в шапке.
 *
 * Правила:
 *  - высота от 44 pt (растёт с крупным шрифтом), текст 16, иконка 17,
 *    стрелка вниз: чип открывает выбор, а не переключает;
 *  - чип показывает выбранное значение («Назрань»), а не имя фильтра;
 *  - без стекла: стекло — только навигационный слой (IOS_FOUNDATION §4.5);
 *  - выбранный — как все выбранные чипы проекта: border-accent bg-accent-soft,
 *    текст и иконка accent (UI_PATTERNS §3.4).
 */

import { CaretDown } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
import { SystemIcon } from "./SystemIcon";

export const FILTER_CHIP_HEIGHT = 44;

export interface FilterChipProps {
  label: string;
  Icon?: IconComponent;
  active: boolean;
  onPress: () => void;
  /** Подпись для VoiceOver, если отличается от label. */
  accessibilityLabel?: string;
}

export function FilterChip({ label, Icon, active, onPress, accessibilityLabel }: FilterChipProps) {
  const tc = useThemeColors(["accent", "ink", "mute"]);
  const fg = active ? tc.accent : tc.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className={`min-h-11 max-w-full flex-row items-center gap-1.5 rounded-pill border pl-3.5 pr-3 py-2 active:opacity-70 ${
        active ? "border-accent bg-accent-soft" : "border-hairline bg-canvas"
      }`}
    >
      {Icon ? <Icon size={17} weight="bold" color={active ? tc.accent : tc.mute} /> : null}
      <AppText
        weight="semibold"
        className="shrink text-ios-callout"
        style={{ color: fg }}
        numberOfLines={1}
      >
        {label}
      </AppText>
      <View>
        <SystemIcon
          sf="chevron.down"
          fallback={CaretDown}
          size={12}
          weight="semibold"
          color={active ? tc.accent : tc.mute}
        />
      </View>
    </Pressable>
  );
}
