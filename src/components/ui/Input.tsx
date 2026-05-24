/**
 * Input — текстовое поле по DESIGN.md (Vercel form-input).
 *
 * Цвета через NativeWind className (CSS-var resolution).
 *
 * Размеры: sm 32 / md 40 (default) / lg 48
 * Состояния: default / error / disabled
 * Слоты: leftIcon, rightIcon, label, hint, error
 */

import { forwardRef, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "@/components/AppText";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends Omit<TextInputProps, "style"> {
  size?: InputSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  label?: string;
  hint?: string;
  error?: string;
}

const SIZE_MAP: Record<InputSize, { height: number; paddingX: number; textSize: 14 | 16; iconGap: number }> = {
  sm: { height: 32, paddingX: 10, textSize: 14, iconGap: 6 },
  md: { height: 40, paddingX: 12, textSize: 14, iconGap: 8 },
  lg: { height: 48, paddingX: 14, textSize: 16, iconGap: 10 },
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { size = "md", leftIcon, rightIcon, label, hint, error, editable = true, ...props },
  ref,
) {
  const dims = SIZE_MAP[size];
  const hasError = !!error;

  const containerClassName = [
    "flex-row items-center rounded-md bg-canvas",
    hasError ? "border-error" : "border-hairline",
  ].join(" ");

  return (
    <View>
      {label ? (
        <AppText weight="medium" className="text-ink" style={{ fontSize: 14, lineHeight: 20, marginBottom: 6 }}>
          {label}
        </AppText>
      ) : null}

      <View
        className={containerClassName}
        style={{
          height: dims.height,
          paddingHorizontal: dims.paddingX,
          gap: dims.iconGap,
          borderWidth: 1,
          opacity: editable ? 1 : 0.5,
        }}
      >
        {leftIcon ? <View className="text-mute">{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          editable={editable}
          // Лучшее что можем — Tailwind className проходит на native через NativeWind.
          // placeholderTextColor требует прямой hex — пока fallback на neutral grey.
          // Будет красиво только если темa light; в dark мы оставляем серый, ОК.
          placeholderTextColor="#888888"
          {...props}
          className="flex-1 text-ink"
          style={{
            fontSize: dims.textSize,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            paddingVertical: 0,
            // outlineStyle: убираем focus-ring на web.
            ...({ outlineStyle: "none" } as object),
          }}
        />
        {rightIcon ? <View className="text-mute">{rightIcon}</View> : null}
      </View>

      {hasError ? (
        <AppText className="text-error" style={{ fontSize: 12, lineHeight: 16, marginTop: 4 }}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText className="text-mute" style={{ fontSize: 12, lineHeight: 16, marginTop: 4 }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});
