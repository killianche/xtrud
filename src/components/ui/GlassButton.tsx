/**
 * GlassButton — выпуклая капсула главного действия 56 pt.
 * На iOS 26 — Liquid Glass с фирменным оттенком (prominent glass button);
 * без стекла — сплошная заливка с тенью. Одна на экран.
 */

import { GlassView } from "expo-glass-effect";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SHADOW_COLOR } from "@/lib/shadows";
import { useThemeColors } from "@/lib/use-theme-color";
import { LIQUID_GLASS } from "./GlassSurface";

export const GLASS_BUTTON_HEIGHT = 56;

export interface GlassButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Второстепенная капсула: без оттенка, текст в цвете акцента. */
  secondary?: boolean;
  /**
   * Нейтральный текст вместо фирменного красного — для второстепенного
   * действия, которое не должно звать громче остальных (владелец,
   * 2026-09-10: «Оставить отзыв» красным — не подходит). Работает вместе с
   * secondary: подложка та же, меняется только цвет надписи.
   */
  neutral?: boolean;
  /**
   * Выглядит неактивной, но нажимается (№290): форма ещё не заполнена, и
   * нажатие показывает, чего не хватает, — глухая кнопка этого не объясняет.
   */
  inactive?: boolean;
  accessibilityHint?: string;
}

export function GlassButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  secondary = false,
  neutral = false,
  inactive = false,
  accessibilityHint,
}: GlassButtonProps) {
  const tc = useThemeColors(["accent", "on-accent", "ink"]);
  // Неактивная — сплошная серая, как неактивная кнопка iOS: полупрозрачная
  // просвечивала поля формы под собой (снимок 2026-10-07, №290).
  const looksOff = inactive && !busy && !disabled;
  const textColor = secondary ? (neutral ? tc.ink : tc.accent) : tc["on-accent"];
  const content = busy ? (
    <ActivityIndicator color={textColor} />
  ) : looksOff ? (
    // Классы токенов, а не цвет из useThemeColors: обе темы гарантированно.
    <AppText weight="semibold" className="text-mute" style={{ fontSize: 18 }}>
      {label}
    </AppText>
  ) : (
    <AppText weight="semibold" style={{ color: textColor, fontSize: 18 }}>
      {label}
    </AppText>
  );
  const shape = {
    height: GLASS_BUTTON_HEIGHT,
    borderRadius: GLASS_BUTTON_HEIGHT / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled || busy}
      className="active:opacity-80"
      style={{ opacity: disabled && !busy ? 0.45 : 1 }}
    >
      {looksOff ? (
        <View className="bg-surface-3" style={shape}>
          {content}
        </View>
      ) : LIQUID_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor={secondary ? undefined : tc.accent}
          style={shape}
        >
          {content}
        </GlassView>
      ) : (
        <View
          className={secondary ? "border border-hairline bg-canvas" : ""}
          style={[
            shape,
            secondary
              ? null
              : {
                  backgroundColor: tc.accent,
                  shadowColor: SHADOW_COLOR,
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 4,
                },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}
