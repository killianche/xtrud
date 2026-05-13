/**
 * Card — карточка по DESIGN.md (Vercel card-marketing + xtrud override 12px radius).
 *
 * Цвета через NativeWind className (CSS-var resolution).
 *
 * Варианты:
 *   - default — bg-canvas + border-hairline (1px)
 *   - soft    — bg-canvas-soft (без border)
 *   - dark    — bg-surface-dark + on-dark текст
 *
 * Padding: none / sm 12 / md 16 (default) / lg 24
 */

import { type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

export type CardVariant = "default" | "soft" | "dark";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  style?: ViewStyle;
  className?: string;
}

const PADDING_MAP: Record<CardPadding, number> = {
  none: 0,
  sm: 12,
  md: 16,
  lg: 24,
};

const VARIANT_CLASS: Record<CardVariant, { bg: string; text: string; border: string; borderWidth: number }> = {
  default: { bg: "bg-canvas", text: "text-ink", border: "border-hairline", borderWidth: 1 },
  soft: { bg: "bg-canvas-soft", text: "text-ink", border: "", borderWidth: 0 },
  dark: { bg: "bg-surface-dark", text: "text-on-dark", border: "", borderWidth: 0 },
};

export function Card({ children, variant = "default", padding = "md", style, className }: CardProps) {
  const vc = VARIANT_CLASS[variant];
  const composed = ["rounded-xl overflow-hidden", vc.bg, vc.text, vc.border, className]
    .filter(Boolean)
    .join(" ");

  return (
    <View
      className={composed}
      style={[
        {
          padding: PADDING_MAP[padding],
          borderWidth: vc.borderWidth,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
