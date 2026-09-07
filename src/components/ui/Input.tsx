/**
 * Input — текстовое поле xtrud.
 *
 * Стандарт 2026-09-02 (DECISION владельца по экрану входа: «всё бело-белое,
 * непонятно, что где нажимать»). Поле обязано читаться как поле без
 * объяснений: мягкая заливка `canvas-soft`, заметная рамка, крупный текст,
 * при фокусе рамка в фирменном акценте. До этого — белое на белом с
 * волосяной рамкой и 14 px.
 *
 * Размеры: md 48 (формы внутри экранов) / lg 54 (auth-формы, главное поле).
 * Оба выше минимума тач-цели 44 pt. `sm` (32) убран — ниже минимума.
 *
 * Высота — `minHeight`: на accessibility-размерах шрифта текст растёт, поле
 * растёт вместе с ним и не режет строку.
 *
 * Цвета — только токены: классы NativeWind для контейнера, useThemeColors
 * для placeholder и курсора (TextInput принимает их только строкой).
 *
 * Состояния: default / focused / error / disabled. Слоты: leftIcon,
 * rightIcon (может быть Pressable — «показать пароль»), label, hint, error.
 *
 * Правила Apple, которым поле обязано следовать (HIG «Text fields», разбор
 * 2026-09-04 по жалобе владельца «криво вписывается, не центрировано»):
 *
 *  1. Поле однострочное фиксированной высоты со скруглением, текст в нём
 *     центрирован по вертикали. У нас он центрирован не был — из-за
 *     `lineHeight`. На iOS `lineHeight` у TextInput кладётся в
 *     `paragraphStyle.maximumLineHeight` UITextField, и весь свободный запас
 *     уходит НАД строкой: текст съезжает вниз и выглядит криво
 *     (facebook/react-native#39145, #28012, #33986). Поэтому на native
 *     `lineHeight` не задаётся вовсе: высоту строки считает системный шрифт,
 *     а по центру ставит контейнер. На web `lineHeight` безвреден и нужен.
 *  2. Клавиатура соответствует содержимому — задаётся вызывающим кодом через
 *     `keyboardType`/`textContentType`.
 *  3. Тёмная клавиатура в тёмной теме: `keyboardAppearance` следует за темой,
 *     иначе на чёрном экране выезжает белая панель.
 *  4. Кнопка очистки в правом конце поля — системная (`clearButtonMode`), а не
 *     нарисованная нами. Включается сама там, где правый слот свободен и поле
 *     не парольное.
 *  5. Ведущий край поля говорит о назначении (leftIcon), задний — про
 *     дополнительные действия (rightIcon). Это уже соблюдалось.
 */

import { forwardRef, type ReactNode, useState } from "react";
import { Platform, TextInput, type TextInputProps, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeColors } from "@/lib/use-theme-color";

export type InputSize = "md" | "lg";

export interface InputProps extends Omit<TextInputProps, "style"> {
  size?: InputSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  label?: string;
  hint?: string;
  error?: string;
}

const SIZE_MAP: Record<InputSize, { minHeight: number; paddingX: number; textSize: number }> = {
  md: { minHeight: 48, paddingX: 14, textSize: 16 },
  lg: { minHeight: 54, paddingX: 16, textSize: 17 },
};

// На web системный шрифт нужно назвать явно; на native пустой fontFamily —
// и есть системный шрифт устройства (см. AppText).
const WEB_SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    size = "md",
    leftIcon,
    rightIcon,
    label,
    hint,
    error,
    editable = true,
    onFocus,
    onBlur,
    ...props
  },
  ref,
) {
  const dims = SIZE_MAP[size];
  const tc = useThemeColors(["muted-soft", "accent", "ink"]);
  const { colorScheme } = useColorScheme();
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

  // Правило 4: системная кнопка очистки там, где правый край свободен.
  // У парольного поля справа «показать пароль», у многострочного очистка
  // ломает разметку — там её нет.
  const clearButtonMode =
    props.clearButtonMode ??
    (rightIcon || props.secureTextEntry || props.multiline ? "never" : "while-editing");

  const borderClass = hasError
    ? "border-error"
    : focused
      ? "border-accent bg-canvas"
      : "border-hairline-strong";

  return (
    <View>
      {label ? (
        <AppText weight="semibold" className="mb-2 text-body-md text-ink">
          {label}
        </AppText>
      ) : null}

      <View
        className={`flex-row items-center gap-3 rounded-xl bg-canvas-soft ${borderClass}`}
        style={{
          minHeight: dims.minHeight,
          paddingHorizontal: dims.paddingX,
          borderWidth: 1.5,
          opacity: editable ? 1 : 0.5,
        }}
      >
        {leftIcon ? <View>{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          editable={editable}
          // Видимый лейбл — отдельный элемент, поэтому VoiceOver-имя поля
          // берём из него, если вызывающий код не задал своё.
          accessibilityLabel={label}
          placeholderTextColor={tc["muted-soft"]}
          selectionColor={tc.accent}
          cursorColor={tc.accent}
          keyboardAppearance={colorScheme === "dark" ? "dark" : "light"}
          clearButtonMode={clearButtonMode}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className="flex-1 text-ink"
          style={{
            fontSize: dims.textSize,
            // Правило 1: lineHeight только на web. На native он смещает текст
            // вниз внутри поля — ровно то, что владелец увидел на скриншоте.
            ...(Platform.OS === "web" ? { lineHeight: dims.textSize + 6 } : {}),
            color: tc.ink,
            // Многострочному полю нужен собственный отступ; однострочное
            // центрирует контейнер (items-center), и лишний padding только
            // мешает при крупном системном шрифте.
            paddingVertical: props.multiline ? 12 : 0,
            // Поле занимает всю высоту контейнера — тап в любое место поля
            // ставит курсор (владелец, 2026-09-07).
            alignSelf: "stretch",
            ...(Platform.OS === "web" ? { fontFamily: WEB_SANS } : {}),
            // outlineStyle: убираем focus-ring на web — рамку рисует контейнер.
            ...({ outlineStyle: "none" } as object),
          }}
        />
        {rightIcon ? <View>{rightIcon}</View> : null}
      </View>

      {hasError ? (
        <AppText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          weight="medium"
          className="mt-2 text-body-sm text-error"
        >
          {error}
        </AppText>
      ) : hint ? (
        <AppText className="mt-2 text-body-sm text-mute">{hint}</AppText>
      ) : null}
    </View>
  );
});
