/**
 * Поля ввода конструктора.
 *
 * Правила Apple («Text fields», «Entering data»): подсказка объясняет, что
 * писать; клавиатура — под тип данных; проверка — когда человек закончил с
 * полем, а не на каждую букву (NN/g: inline validation after completion);
 * ошибка — рядом с полем, коротко. У однострочного поля нет lineHeight
 * (текст стоит по центру — см. tailwind field-*).
 */

import { Check } from "phosphor-react-native";
import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
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
  /**
   * Показать ошибку сразу, не дожидаясь, что поле покинули (форма одним
   * экраном, вариант B №249: нажали «Опубликовать» с незаполненным полем —
   * ошибка видна немедленно, docs/COMPOSER_ONE_FORM_2026-10.md).
   */
  forceError?: boolean;
  hint?: string;
  /** Крупное поле для главного текста (22 pt) или обычное (17 pt). */
  size?: "title" | "body";
  multiline?: boolean;
  /**
   * Однострочное на вид поле, которое растёт по тексту (первый экран «Что
   * нужно сделать?», №242): написанное станет названием и может быть длиннее
   * строки — горизонтальная прокрутка его прятала бы.
   */
  autoGrow?: boolean;
  /** Значение справа, например «₽». */
  suffix?: string;
  /**
   * Поле в строке рядом с кнопкой (сумма и «Договорная», №260): без своих
   * отступов, растягивается на свободное место; ошибку показывает строка.
   */
  inline?: boolean;
}

export const ComposerField = forwardRef<TextInput, ComposerFieldProps>(function ComposerField(
  {
    value,
    onChangeText,
    placeholder,
    label,
    error,
    forceError = false,
    hint,
    size = "body",
    multiline = false,
    autoGrow = false,
    suffix,
    inline = false,
    onBlur,
    onFocus,
    ...props
  },
  ref,
) {
  const tc = useThemeColors(["ink", "mute", "muted-soft", "accent", "error", "on-accent"]);
  // Над клавиатурой справа — кнопка-галочка «скрыть клавиатуру», чтобы
  // спокойно нажать «Далее» внизу (владелец, 2026-09-13). На iOS это родной
  // механизм — панель над клавиатурой; на Android клавиатуру закрывает
  // системная «назад».
  const accessoryId = useId();
  const withAccessory = Platform.OS === "ios";
  const { colorScheme } = useColorScheme();
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  // Веб: textarea сама не растёт — высота по содержимому (iPhone растёт сам).
  const [webHeight, setWebHeight] = useState<number | null>(null);
  const growOnWeb = autoGrow && Platform.OS === "web";
  const showError = (touched || forceError) && !focused && !!error;
  const showMessage = !inline;
  const fontSize = size === "title" ? 24 : 18;
  // Свой ref — чтобы нажатие в любое место плитки ставило курсор; наружу
  // отдаём то же поле, как раньше.
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput, []);

  return (
    <View className={inline ? "flex-1" : "mb-5 px-4"}>
      {label ? (
        <AppText className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute">{label}</AppText>
      ) : null}
      {/* Поле отличается от фона заливкой, а рамка — тонкая и мягкая
          (владелец, 2026-09-12: «обводка слишком сильная»). Прежняя 1.5
          hairline-strong выглядела чёрной. Совсем без рамки нельзя: в
          тёмной теме поле сливалось с фоном и было невидимым, пока не
          нажмёшь (владелец, 2026-09-11). В фокусе рамка — акцентная.
          Вся плитка — одна цель нажатия: тап в отступ тоже ставит курсор. */}
      <Pressable
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        className={`flex-row items-center rounded-2xl bg-canvas-soft px-4 ${
          showError ? "border-error" : focused ? "border-accent" : "border-hairline"
        }`}
        style={[
          { borderWidth: 1 },
          multiline
            ? { minHeight: 132, alignItems: "flex-start", paddingVertical: 12 }
            : autoGrow
              ? { minHeight: 56, paddingVertical: 12 }
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
          multiline={multiline || autoGrow}
          // Веб рисует textarea в две строки по умолчанию; iPhone и так берёт
          // высоту по тексту.
          {...(growOnWeb ? ({ rows: 1 } as object) : {})}
          onContentSizeChange={(e) => {
            if (growOnWeb) setWebHeight(e.nativeEvent.contentSize.height);
            props.onContentSizeChange?.(e);
          }}
          textAlignVertical={multiline ? "top" : "center"}
          inputAccessoryViewID={withAccessory ? accessoryId : undefined}
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
            ...(autoGrow ? { lineHeight: Math.round(fontSize * 1.3) } : {}),
            ...(growOnWeb && webHeight ? { height: webHeight } : {}),
            ...({ outlineStyle: "none" } as object),
          }}
        />
        {suffix ? (
          <AppText weight="semibold" className="ml-2 text-ios-title2 text-mute">
            {suffix}
          </AppText>
        ) : null}
      </Pressable>
      {showMessage && showError ? (
        <AppText accessibilityRole="alert" className="mt-1.5 ml-4 text-ios-footnote text-error">
          {error}
        </AppText>
      ) : showMessage && hint ? (
        <AppText className="mt-1.5 ml-4 text-ios-footnote text-mute">{hint}</AppText>
      ) : null}
      {withAccessory ? (
        <InputAccessoryView nativeID={accessoryId} backgroundColor="transparent">
          <View className="flex-row justify-end px-4 pb-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Скрыть клавиатуру"
              onPress={() => Keyboard.dismiss()}
              hitSlop={6}
              className="h-12 w-12 items-center justify-center rounded-full bg-link active:opacity-80"
            >
              <Check size={24} weight="bold" color={tc["on-accent"]} />
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
});
