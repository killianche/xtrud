/**
 * FilterChip — капсула фильтра в стиле iOS 26 Liquid Glass.
 *
 * DECISION владельца 2026-09-07: «фильтры, пилюли, строки поиска — полностью
 * как в последнем iOS, Liquid Glass». У Apple в iOS 26 фильтры под
 * заголовком (Почта: категории) — стеклянные капсулы; выбранная — с оттенком.
 *
 * Правила:
 *  - капсула 44 pt, текст Callout 16, иконка 17, стрелка вниз (chevron.down:
 *    чип открывает выбор, а не переключает);
 *  - материал: стекло; применённый фильтр — стекло с фирменным оттенком и
 *    белым текстом. Без стекла (iOS до 26) — поверхность с волосяной границей
 *    и акцентная заливка;
 *  - чип показывает выбранное значение («Сантехника»), а не имя фильтра.
 */

import { GlassView } from "expo-glass-effect";
import { CaretDown } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
import { LIQUID_GLASS } from "./GlassSurface";
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
  const tc = useThemeColors(["accent", "on-accent", "ink", "mute"]);
  const fg = active ? tc["on-accent"] : tc.ink;
  const content = (
    <View className="h-full flex-row items-center gap-1.5 pl-4 pr-3">
      {Icon ? <Icon size={17} weight="bold" color={fg} /> : null}
      <AppText
        weight="semibold"
        className="text-ios-callout"
        style={{ color: fg }}
        numberOfLines={1}
      >
        {label}
      </AppText>
      <SystemIcon
        sf="chevron.down"
        fallback={CaretDown}
        size={12}
        weight="semibold"
        color={active ? tc["on-accent"] : tc.mute}
      />
    </View>
  );
  const shape = {
    height: FILTER_CHIP_HEIGHT,
    borderRadius: FILTER_CHIP_HEIGHT / 2,
    overflow: "hidden" as const,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="active:opacity-70"
    >
      {LIQUID_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor={active ? tc.accent : undefined}
          isInteractive
          style={shape}
        >
          {content}
        </GlassView>
      ) : (
        <View className={active ? "bg-accent" : "border border-hairline bg-canvas"} style={shape}>
          {content}
        </View>
      )}
    </Pressable>
  );
}
