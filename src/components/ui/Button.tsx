/**
 * Button — primary CTA по DESIGN.md (Vercel-based).
 *
 * Варианты:
 *   - primary   — bg-primary (#171717 light / #fafafa dark), on-primary текст. Pill.
 *   - secondary — bg-canvas + border hairline, ink текст. Pill.
 *   - ghost     — без фона, без border, ink текст. Pill.
 *   - destructive — bg-error, on-primary текст. Pill.
 *
 * Размеры (height x typography):
 *   - sm — 32px, body-sm 14/20
 *   - md — 40px, body-sm 14/20
 *   - lg — 48px, body-md 16/24
 *
 * Состояния:
 *   - disabled → opacity 0.5 + не реагирует
 *   - loading  → ActivityIndicator вместо текста, не реагирует
 *   - pressed  → active:opacity 70 (web hover отдельно)
 *
 * Использование:
 *   <Button onPress={...}>Описать задачу</Button>
 *   <Button variant="secondary" size="md" leftIcon={<Search size={16} />}>Найти</Button>
 *   <Button variant="destructive" loading={isDeleting}>Удалить</Button>
 */

import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type PressableProps } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Иконка слева от текста (Lucide). Размер подбирается под size. */
  leftIcon?: ReactNode;
  /** Иконка справа от текста (Lucide). */
  rightIcon?: ReactNode;
  /** full-width — Pressable растягивается на 100% контейнера. */
  fullWidth?: boolean;
}

const SIZE_MAP: Record<ButtonSize, { height: number; paddingX: number; textSize: 14 | 16; gap: number }> = {
  sm: { height: 32, paddingX: 12, textSize: 14, gap: 6 },
  md: { height: 40, paddingX: 16, textSize: 14, gap: 8 },
  lg: { height: 48, paddingX: 20, textSize: 16, gap: 10 },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  ...pressableProps
}: ButtonProps) {
  const tc = useThemeColors(["primary", "on-primary", "ink", "canvas", "hairline", "error", "on-dark"]);
  const dims = SIZE_MAP[size];
  const isDisabled = disabled || loading;

  // Варианты — фон / текст / border.
  const palette = (() => {
    switch (variant) {
      case "primary":
        return { bg: tc.primary, fg: tc["on-primary"], border: "transparent" };
      case "secondary":
        return { bg: tc.canvas, fg: tc.ink, border: tc.hairline };
      case "ghost":
        return { bg: "transparent", fg: tc.ink, border: "transparent" };
      case "destructive":
        return { bg: tc.error, fg: tc["on-dark"], border: "transparent" };
    }
  })();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      {...pressableProps}
      style={({ pressed }) => ({
        height: dims.height,
        paddingHorizontal: dims.paddingX,
        backgroundColor: palette.bg,
        borderRadius: 100, // pill
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: palette.border,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: dims.gap,
        opacity: isDisabled ? 0.5 : pressed ? 0.7 : 1,
        alignSelf: fullWidth ? "stretch" : "auto",
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {leftIcon ? <View>{leftIcon}</View> : null}
          <AppText
            weight="medium"
            style={{
              color: palette.fg,
              fontSize: dims.textSize,
              lineHeight: dims.textSize === 14 ? 20 : 24,
            }}
          >
            {children as string}
          </AppText>
          {rightIcon ? <View>{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}
