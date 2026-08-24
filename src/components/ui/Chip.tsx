/**
 * Chip / Badge — pill-форма на DESIGN.md (Vercel badge-secondary паттерн).
 *
 * Цвета через NativeWind className (CSS-var resolution).
 *
 * Варианты: default / outline / dark / success / warning / error
 * Размеры: sm (22px) / md (28px)
 */

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";

export type ChipVariant = "default" | "outline" | "dark" | "success" | "warning" | "error";
export type ChipSize = "sm" | "md";

export interface ChipProps {
  children: ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onPress?: () => void;
  mono?: boolean;
}

const SIZE_MAP: Record<
  ChipSize,
  { height: number; paddingX: number; fontSize: 12 | 13; gap: number }
> = {
  sm: { height: 22, paddingX: 8, fontSize: 12, gap: 4 },
  md: { height: 28, paddingX: 10, fontSize: 13, gap: 6 },
};

const VARIANT_CLASS: Record<
  ChipVariant,
  { bg: string; text: string; border: string; borderWidth: number }
> = {
  default: { bg: "bg-canvas-soft", text: "text-body", border: "", borderWidth: 0 },
  outline: { bg: "bg-canvas", text: "text-body", border: "border-hairline", borderWidth: 1 },
  dark: { bg: "bg-primary", text: "text-on-primary", border: "", borderWidth: 0 },
  success: { bg: "bg-success-soft", text: "text-success", border: "", borderWidth: 0 },
  warning: { bg: "bg-warning-soft", text: "text-warning-deep", border: "", borderWidth: 0 },
  error: { bg: "bg-error-soft", text: "text-error", border: "", borderWidth: 0 },
};

export function Chip({
  children,
  variant = "default",
  size = "md",
  leftIcon,
  rightIcon,
  onPress,
  mono = false,
}: ChipProps) {
  const dims = SIZE_MAP[size];
  const vc = VARIANT_CLASS[variant];

  const className = ["flex-row items-center self-start", "rounded-full", vc.bg, vc.text, vc.border]
    .filter(Boolean)
    .join(" ");

  const body = (
    <View
      className={className}
      style={{
        height: dims.height,
        paddingHorizontal: dims.paddingX,
        gap: dims.gap,
        borderWidth: vc.borderWidth,
      }}
    >
      {leftIcon ? <View className={vc.text}>{leftIcon}</View> : null}
      <AppText
        weight={mono ? "mono" : "medium"}
        className={vc.text}
        style={{ fontSize: dims.fontSize, lineHeight: dims.fontSize + 4 }}
      >
        {children as string}
      </AppText>
      {rightIcon ? <View className={vc.text}>{rightIcon}</View> : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}
