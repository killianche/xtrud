/**
 * Card — карточка по DESIGN.md (Vercel card-marketing + xtrud override 12px radius).
 *
 * Варианты:
 *   - default — bg-canvas + border hairline, 12px радиус
 *   - soft    — bg-canvas-soft (без border), 12px радиус
 *   - dark    — bg-surface-dark + on-dark текст, 12px радиус (для категорий/featured)
 *
 * Padding:
 *   - sm — 12px
 *   - md — 16px (default)
 *   - lg — 24px
 *
 * Не имеет встроенного onPress — оборачивай в Pressable если нужен tap.
 */

import { type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useThemeColors } from "@/lib/use-theme-color";

export type CardVariant = "default" | "soft" | "dark";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  /** Дополнительный inline style (margin/width и т.п.). Не для bg/border — те через variant. */
  style?: ViewStyle;
  /** Дополнительный className (NativeWind). Полезно для responsive ширин. */
  className?: string;
}

const PADDING_MAP: Record<CardPadding, number> = {
  none: 0,
  sm: 12,
  md: 16,
  lg: 24,
};

export function Card({ children, variant = "default", padding = "md", style, className }: CardProps) {
  const tc = useThemeColors(["canvas", "canvas-soft", "hairline", "surface-dark"]);

  const palette = (() => {
    switch (variant) {
      case "default":
        return { bg: tc.canvas, border: tc.hairline, borderWidth: 1 };
      case "soft":
        return { bg: tc["canvas-soft"], border: "transparent", borderWidth: 0 };
      case "dark":
        return { bg: tc["surface-dark"], border: "transparent", borderWidth: 0 };
    }
  })();

  return (
    <View
      className={className}
      style={[
        {
          backgroundColor: palette.bg,
          borderRadius: 12, // xtrud override
          borderWidth: palette.borderWidth,
          borderColor: palette.border,
          padding: PADDING_MAP[padding],
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
