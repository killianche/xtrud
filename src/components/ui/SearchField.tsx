/**
 * SearchField — поле поиска xtrud.
 *
 * Появилось 2026-09-04 по разбору жалобы владельца: «в поиске вписываю слово,
 * оно криво вписывается, не центрировано, неграмотно сделано. Изучи, как
 * делаются поля ввода у Apple, и сделай как у Apple».
 *
 * До этого экран «Специалисты» рисовал поиск россыпью: сырой `TextInput` с
 * классом типографики (а значит с `lineHeight`, из-за которого текст на iOS
 * съезжает вниз — см. комментарий в `Input.tsx`), своя кнопка-крестик вместо
 * системной и никакой кнопки «Отмена». Теперь поиск — один компонент, и он
 * следует правилам Apple HIG «Search fields»:
 *
 *  1. Поле показывает кнопку очистки. Она системная (`clearButtonMode`), а не
 *     наша: у неё правильный размер, позиция и поведение при наборе.
 *     На Android и web системной кнопки нет — там рисуем свою.
 *  2. Кнопка «Отмена» прекращает поиск: очищает поле и убирает клавиатуру.
 *     Apple показывает её, когда человек начал ввод, а не всегда.
 *  3. Подсказка в поле объясняет, что можно искать («Имя или услуга»), а не
 *     повторяет слово «Поиск» — оно ничего не сообщает.
 *  4. Ведущий край поля говорит о назначении: лупа слева.
 *  5. Клавиша Return — «Поиск»; клавиатура следует теме приложения.
 *  6. Автозамена и автокапитализация выключены: они мешают искать имена и
 *     названия услуг.
 *  7. Высота 48 — выше минимальной тач-цели 44 pt; текст центрирован
 *     контейнером, без `lineHeight`.
 */

import { MagnifyingGlass, X } from "phosphor-react-native";
import { forwardRef, useState } from "react";
import { Keyboard, Platform, Pressable, TextInput, type TextInputProps, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeColors } from "@/lib/use-theme-color";
import { SystemIcon } from "./SystemIcon";

export interface SearchFieldProps extends Omit<TextInputProps, "style" | "value" | "onChangeText"> {
  value: string;
  onChangeText: (next: string) => void;
  /** Подсказка. Обязана объяснять, что искать (правило 3). */
  placeholder: string;
  /** Показывать «Отмена» при вводе. Выключается там, где поиск — весь экран
   *  и уходить некуда. */
  showCancel?: boolean;
  /** Дополнительное действие по «Отмене» — например, закрыть шторку. */
  onCancel?: () => void;
  /** Поле не прошло проверку — рамка в цвете ошибки. */
  invalid?: boolean;
}

const IOS_CLEAR_BUTTON = Platform.OS === "ios";

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  {
    value,
    onChangeText,
    placeholder,
    showCancel = true,
    onCancel,
    invalid = false,
    onFocus,
    onBlur,
    ...props
  },
  ref,
) {
  const tc = useThemeColors(["mute", "ink", "accent", "muted-soft", "error"]);
  const { colorScheme } = useColorScheme();
  const [focused, setFocused] = useState(false);

  // Правило 2: «Отмена» появляется, когда поиск начат, а не занимает место
  // всегда.
  const cancelVisible = showCancel && (focused || value.length > 0);

  return (
    <View accessibilityRole="search" className="flex-row items-center gap-2">
      <View
        className={`min-h-12 flex-1 flex-row items-center gap-2.5 rounded-xl bg-canvas-soft px-3.5 ${
          invalid ? "border-error" : focused ? "border-accent" : "border-hairline-strong"
        }`}
        style={{ borderWidth: 1.5 }}
      >
        <SystemIcon
          sf="magnifyingglass"
          fallback={MagnifyingGlass}
          size={18}
          weight="medium"
          color={invalid ? tc.error : focused ? tc.accent : tc.mute}
        />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tc["muted-soft"]}
          selectionColor={tc.accent}
          cursorColor={tc.accent}
          keyboardAppearance={colorScheme === "dark" ? "dark" : "light"}
          clearButtonMode={IOS_CLEAR_BUTTON ? "while-editing" : "never"}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          inputMode="search"
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
            fontSize: 17,
            color: tc.ink,
            paddingVertical: 0,
            ...({ outlineStyle: "none" } as object),
          }}
        />
        {/* Правило 1: своя кнопка очистки только там, где системной нет. */}
        {!IOS_CLEAR_BUTTON && value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить поиск"
            hitSlop={12}
            onPress={() => onChangeText("")}
            className="h-7 w-7 items-center justify-center rounded-full bg-canvas-soft-2 active:opacity-70"
          >
            <X size={14} weight="bold" color={tc.mute} />
          </Pressable>
        ) : null}
      </View>

      {cancelVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отменить поиск"
          hitSlop={8}
          onPress={() => {
            // Apple: «Отмена» немедленно прекращает поиск — пустое поле и
            // убранная клавиатура, а не просто снятый фокус.
            onChangeText("");
            Keyboard.dismiss();
            onCancel?.();
          }}
          className="min-h-12 justify-center px-1 active:opacity-60"
        >
          <AppText weight="medium" className="text-body-lg text-accent">
            Отмена
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
});
