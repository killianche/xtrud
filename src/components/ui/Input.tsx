/**
 * Input — текстовое поле по DESIGN.md (form-input от Vercel).
 *
 * Размеры (height):
 *   - sm — 32px
 *   - md — 40px (default)
 *   - lg — 48px (для SearchBar / hero-форм)
 *
 * Состояния:
 *   - default     — border hairline
 *   - focused     — border ink (на web автоматом через :focus-within)
 *   - error       — border error + сообщение под полем
 *   - disabled    — opacity 0.5 + не редактируется
 *
 * Слоты:
 *   - leftIcon  — иконка слева (Lucide), отступ от текста 8px
 *   - rightIcon — иконка / Pressable справа (например, clear-button)
 *   - label     — лейбл сверху (опционально)
 *   - hint      — подсказка под полем
 *   - error     — error message под полем (заменяет hint)
 *
 * Использование:
 *   <Input value={x} onChangeText={setX} placeholder="..." />
 *   <Input label="Телефон" leftIcon={<Phone size={16} />} keyboardType="phone-pad" />
 *   <Input error="Неверный формат" value={x} onChangeText={setX} />
 */

import { forwardRef, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

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
  const tc = useThemeColors(["canvas", "ink", "mute", "hairline", "error"]);
  const dims = SIZE_MAP[size];
  const hasError = !!error;

  return (
    <View>
      {label ? (
        <AppText weight="medium" style={{ color: tc.ink, fontSize: 14, lineHeight: 20, marginBottom: 6 }}>
          {label}
        </AppText>
      ) : null}

      <View
        style={{
          height: dims.height,
          paddingHorizontal: dims.paddingX,
          borderRadius: 6, // Vercel form-input rounded.sm
          borderWidth: 1,
          borderColor: hasError ? tc.error : tc.hairline,
          backgroundColor: tc.canvas,
          flexDirection: "row",
          alignItems: "center",
          gap: dims.iconGap,
          opacity: editable ? 1 : 0.5,
        }}
      >
        {leftIcon ? <View>{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={tc.mute}
          {...props}
          style={{
            flex: 1,
            color: tc.ink,
            fontSize: dims.textSize,
            // На web fontFamily через AppText не применяется — задаём явно.
            fontFamily: '"Geist", "Inter", system-ui, sans-serif',
            paddingVertical: 0, // убирает дефолтный padding на Android
            // outlineStyle: на web TextInput может рендерить outline — убираем.
            // (Передаём через style cast.)
            ...({ outlineStyle: "none" } as object),
          }}
        />
        {rightIcon ? <View>{rightIcon}</View> : null}
      </View>

      {hasError ? (
        <AppText style={{ color: tc.error, fontSize: 12, lineHeight: 16, marginTop: 4 }}>{error}</AppText>
      ) : hint ? (
        <AppText style={{ color: tc.mute, fontSize: 12, lineHeight: 16, marginTop: 4 }}>{hint}</AppText>
      ) : null}
    </View>
  );
});
