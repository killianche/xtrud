/**
 * Button — primary CTA по DESIGN.md (Vercel pill).
 *
 * Цвета через **NativeWind className** (CSS-var resolution via html.dark класс).
 * Это единственный надёжный путь — inline style с CSS-var не работает в RNW.
 *
 * Варианты:
 *   - primary     — bg-primary + on-primary (чёрный CTA в light, белый в dark)
 *   - accent      — bg-accent + белый контент (фирменный розово-красный; главное действие экрана)
 *   - secondary   — bg-canvas + border-hairline + ink
 *   - ghost       — без фона/border + ink
 *   - destructive — bg-error + white
 *
 * Размеры: md 44 (default, минимум тач-цели) / lg 48
 *
 * `sm` (32 pt) убран: ни один вызов в коде им не пользовался, а 32 pt ниже
 * минимума тач-цели 44 pt (`docs/IOS_FOUNDATION.md` §3.8) — тащить неиспользуемый
 * размер, нарушающий планку, хуже, чем не иметь его вовсе.
 *
 * Высота — `minHeight`, не `height`: на крупных Dynamic Type текст внутри
 * кнопки не обрезается, а кнопка растёт вместе с ним.
 *
 * Состояния: disabled (opacity 50), loading (ActivityIndicator), pressed (opacity 70)
 */

import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
import { AppText } from "@/components/AppText";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "accent";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

// lg — главное действие экрана (формы входа, пустые состояния): 52 pt и 17 px,
// как у системных кнопок iOS в формах. DECISION владельца 2026-09-02: «шрифты
// слишком мелкие» — 14 px в главной кнопке читалось как второстепенное.
const SIZE_MAP: Record<
  ButtonSize,
  { minHeight: number; paddingX: number; textSize: number; gap: number }
> = {
  md: { minHeight: 44, paddingX: 16, textSize: 15, gap: 8 },
  lg: { minHeight: 52, paddingX: 20, textSize: 17, gap: 10 },
};

const VARIANT_CLASS: Record<
  ButtonVariant,
  { bg: string; text: string; border: string; borderWidth: number; iconText: string }
> = {
  primary: {
    bg: "bg-primary",
    text: "text-on-primary",
    border: "",
    borderWidth: 0,
    iconText: "text-on-primary",
  },
  secondary: {
    bg: "bg-canvas",
    text: "text-ink",
    border: "border-hairline",
    borderWidth: 1,
    iconText: "text-ink",
  },
  ghost: { bg: "", text: "text-ink", border: "", borderWidth: 0, iconText: "text-ink" },
  destructive: {
    bg: "bg-error",
    text: "text-on-dark",
    border: "",
    borderWidth: 0,
    iconText: "text-on-dark",
  },
  // Фирменный акцент как главное действие экрана. DECISION владельца
  // 2026-09-02 по экрану задания: «кнопка цветнее». Пилот — экран задания;
  // если приживётся, станет стандартом (см. DESIGN.md, раздел про акцент).
  // Текст и иконки — токен on-accent, белый в обеих темах (DECISION владельца
  // 2026-09-03 по сборке 21: «на розовых кнопках нужен белый контент»).
  // Цена этого решения по контрасту описана в src/lib/colors.ts.
  accent: {
    bg: "bg-accent",
    text: "text-on-accent",
    border: "",
    borderWidth: 0,
    iconText: "text-on-accent",
  },
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
  const dims = SIZE_MAP[size];
  const vc = VARIANT_CLASS[variant];
  const isDisabled = disabled || loading;

  // Composed className: Tailwind для цветов, inline style для размеров.
  // currentColor наследуется в SVG-иконках — поэтому icon-color обёртка использует ту же палитру.
  const className = [
    "flex-row items-center justify-center",
    "rounded-full", // pill (Tailwind rounded-full = 9999)
    vc.bg,
    vc.text,
    vc.border,
    "active:opacity-70",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      {...pressableProps}
      className={className}
      style={{
        minHeight: dims.minHeight,
        paddingHorizontal: dims.paddingX,
        gap: dims.gap,
        borderWidth: vc.borderWidth,
        opacity: isDisabled ? 0.5 : 1,
        alignSelf: fullWidth ? "stretch" : "auto",
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : (
        <>
          {leftIcon ? <View className={vc.iconText}>{leftIcon}</View> : null}
          <AppText
            weight="semibold"
            className={vc.text}
            style={{ fontSize: dims.textSize, lineHeight: dims.textSize + 7 }}
          >
            {children as string}
          </AppText>
          {rightIcon ? <View className={vc.iconText}>{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}
