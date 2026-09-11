/**
 * Поля ввода конструктора.
 *
 * Правила Apple («Text fields», «Entering data»): подсказка объясняет, что
 * писать; клавиатура — под тип данных; проверка — когда человек закончил с
 * полем, а не на каждую букву (NN/g: inline validation after completion);
 * ошибка — рядом с полем, коротко. У однострочного поля нет lineHeight
 * (текст стоит по центру — см. tailwind field-*).
 */

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, TextInput, type TextInputProps, View } from "react-native";
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
  const fontSize = size === "title" ? 24 : 18;
  // Свой ref — чтобы нажатие в любое место плитки ставило курсор; наружу
  // отдаём то же поле, как раньше.
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput, []);

  return (
    <View className="mb-5 px-4">
      {label ? (
        <AppText className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute">{label}</AppText>
      ) : null}
      {/* Рамка видна сразу, а не только в фокусе (владелец, 2026-09-11): в
          тёмной теме плитка bg-canvas совпадала с фоном экрана, и поле было
          невидимым, пока не нажмёшь. Как у Input (DESIGN.md): 1.5
          hairline-strong, в фокусе — accent. Вся плитка — одна цель
          нажатия: тап в отступ вокруг текста тоже ставит курсор. */}
      <Pressable
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        className={`flex-row items-center rounded-2xl bg-canvas px-4 ${
          showError ? "border-error" : focused ? "border-accent" : "border-hairline-strong"
        }`}
        style={[
          { borderWidth: 1.5 },
          multiline
            ? { minHeight: 132, alignItems: "flex-start", paddingVertical: 12 }
            : { minHeight: 56 },
        ]}
      >
        <TextInput
          ref={inputRef}
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
          // alignSelf: stretch — поле ввода занимает всю высоту плитки, а не
          // одну строку текста: тап в любое место белой плитки ставит курсор
          // (владелец, 2026-09-07: «нажимаешь в пустое место поля — не
          // откликается»). Однострочное поле iOS центрирует текст само.
          style={{
            fontSize,
            fontWeight: size === "title" ? "600" : "400",
            color: tc.ink,
            paddingVertical: 0,
            alignSelf: "stretch",
            ...(multiline ? { lineHeight: Math.round(fontSize * 1.35), minHeight: 132 - 24 } : {}),
            ...({ outlineStyle: "none" } as object),
          }}
        />
        {suffix ? (
          <AppText weight="semibold" className="ml-2 text-ios-title2 text-mute">
            {suffix}
          </AppText>
        ) : null}
      </Pressable>
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
