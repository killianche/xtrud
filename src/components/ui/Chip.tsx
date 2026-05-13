/**
 * Chip / Badge — pill-форма на DESIGN.md (Vercel badge-secondary паттерн).
 *
 * Варианты:
 *   - default   — bg-canvas-soft + body текст (Vercel badge-secondary)
 *   - outline   — bg-canvas + border hairline + body
 *   - dark      — bg-primary + on-primary (например, "Selected", active filter)
 *   - success   — bg-success-soft + success-deep — заказ выполнен
 *   - warning   — bg-warning-soft + warning-deep — ждёт оплаты
 *   - error     — bg-error-soft + error-deep — отменён
 *
 * Тип использования:
 *   - Информационный бейдж (только текст): <Chip>★ 4.9</Chip>
 *   - Tappable chip (city selector, filter): <Chip onPress={...} variant="outline">Магас ▾</Chip>
 *   - Дополнительная иконка слева: <Chip leftIcon={<MapPin size={12} />}>Магас</Chip>
 *
 * Размеры:
 *   - sm — height 22px (мелкие метрики)
 *   - md — height 28px (default, чипы фильтров)
 */

import { type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

export type ChipVariant = "default" | "outline" | "dark" | "success" | "warning" | "error";
export type ChipSize = "sm" | "md";

export interface ChipProps {
  children: ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onPress?: () => void;
  /** Использует mono-шрифт (для метрик «★ 4.9», «12 км», «от 2 500 ₽»). xtrud override. */
  mono?: boolean;
}

const SIZE_MAP: Record<ChipSize, { height: number; paddingX: number; fontSize: 12 | 13; gap: number }> = {
  sm: { height: 22, paddingX: 8, fontSize: 12, gap: 4 },
  md: { height: 28, paddingX: 10, fontSize: 13, gap: 6 },
};

export function Chip({ children, variant = "default", size = "md", leftIcon, rightIcon, onPress, mono = false }: ChipProps) {
  const tc = useThemeColors([
    "canvas",
    "canvas-soft",
    "ink",
    "body",
    "hairline",
    "primary",
    "on-primary",
    "success",
    "success-soft",
    "warning-deep",
    "warning-soft",
    "error",
    "error-soft",
  ]);
  const dims = SIZE_MAP[size];

  const palette = (() => {
    switch (variant) {
      case "default":
        return { bg: tc["canvas-soft"], fg: tc.body, border: "transparent", borderWidth: 0 };
      case "outline":
        return { bg: tc.canvas, fg: tc.body, border: tc.hairline, borderWidth: 1 };
      case "dark":
        return { bg: tc.primary, fg: tc["on-primary"], border: "transparent", borderWidth: 0 };
      case "success":
        return { bg: tc["success-soft"], fg: tc.success, border: "transparent", borderWidth: 0 };
      case "warning":
        return { bg: tc["warning-soft"], fg: tc["warning-deep"], border: "transparent", borderWidth: 0 };
      case "error":
        return { bg: tc["error-soft"], fg: tc.error, border: "transparent", borderWidth: 0 };
    }
  })();

  const body = (
    <View
      style={{
        height: dims.height,
        paddingHorizontal: dims.paddingX,
        backgroundColor: palette.bg,
        borderRadius: 9999, // full pill
        borderWidth: palette.borderWidth,
        borderColor: palette.border,
        flexDirection: "row",
        alignItems: "center",
        gap: dims.gap,
        alignSelf: "flex-start",
      }}
    >
      {leftIcon ? <View>{leftIcon}</View> : null}
      <AppText
        weight={mono ? "mono" : "medium"}
        style={{ color: palette.fg, fontSize: dims.fontSize, lineHeight: dims.fontSize + 4 }}
      >
        {children as string}
      </AppText>
      {rightIcon ? <View>{rightIcon}</View> : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}
