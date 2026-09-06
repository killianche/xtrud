/**
 * Поля ввода конструктора.
 *
 * Правила Apple («Text fields», «Entering data»): подсказка объясняет, что
 * писать; клавиатура — под тип данных; проверка — когда человек закончил с
 * полем, а не на каждую букву (NN/g: inline validation after completion);
 * ошибка — рядом с полем, коротко. У однострочного поля нет lineHeight
 * (текст стоит по центру — см. tailwind field-*).
 */

import { forwardRef, useState } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeColors } from "@/lib/use-theme-color";

export interface ComposerFieldProps
  extends Omit<TextInputProps, "style" | "value" | "onChangeText"> {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  /** Подпись над полем — когда полей несколько. */
  label?: string;
  /** Ошибка показывается только после того, как поле покинули. */
  error?: string | null;
  hint?: string;
  /** Крупное поле для главного текста (22 pt) или обычное (17 pt). */
  size?: "title" | "body";
  multiline?: boolean;
  /** Значение справа, например «₽». */
  suffix?: string;
}

export const ComposerField = forwardRef<TextInput, ComposerFieldProps>(function ComposerField(
  {
    value,
    onChangeText,
    placeholder,
    label,
    error,
    hint,
    size = "body",
    multiline = false,
    suffix,
    onBlur,
    onFocus,
    ...props
  },
  ref,
) {
  const tc = useThemeColors(["ink", "mute", "muted-soft", "accent", "error"]);
  const { colorScheme } = useColorScheme();
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const showError = touched && !focused && !!error;
  const fontSize = size === "title" ? 22 : 17;

  return (
    <View className="mb-5 px-4">
      {label ? (
        <AppText className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute">{label}</AppText>
      ) : null}
      <View
        className={`flex-row items-center rounded-2xl bg-canvas px-4 ${
          showError
            ? "border border-error"
            : focused
              ? "border border-accent"
              : "border border-transparent"
        }`}
        style={
          multiline
            ? { minHeight: 132, alignItems: "flex-start", paddingVertical: 12 }
            : { minHeight: 56 }
        }
      >
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tc["muted-soft"]}
          selectionColor={tc.accent}
          cursorColor={tc.accent}
          keyboardAppearance={colorScheme === "dark" ? "dark" : "light"}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            setTouched(true);
            onBlur?.(e);
          }}
          className="flex-1 text-ink"
          style={{
            fontSize,
            fontWeight: size === "title" ? "600" : "400",
            color: tc.ink,
            paddingVertical: 0,
            ...(multiline ? { lineHeight: Math.round(fontSize * 1.35) } : {}),
            ...({ outlineStyle: "none" } as object),
          }}
        />
        {suffix ? (
          <AppText weight="semibold" className="ml-2 text-ios-title2 text-mute">
            {suffix}
          </AppText>
        ) : null}
      </View>
      {showError ? (
        <AppText accessibilityRole="alert" className="mt-1.5 ml-4 text-ios-footnote text-error">
          {error}
        </AppText>
      ) : hint ? (
        <AppText className="mt-1.5 ml-4 text-ios-footnote text-mute">{hint}</AppText>
      ) : null}
    </View>
  );
});
