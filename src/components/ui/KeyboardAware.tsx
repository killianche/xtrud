/**
 * Формы и клавиатура — одна механика на iOS и Android.
 *
 * Владелец, 2026-10-20 (№348, фото регистрации на Android): «начинает вводить
 * пароль, а клавиатура закрывает поле; нужно как у больших компаний — видеть,
 * что вводишь, и легко закрыть клавиатуру».
 *
 * Причина (FACT): формы держались на `KeyboardAvoidingView` из react-native с
 * `behavior={Platform.OS === "ios" ? "padding" : undefined}` — на Android
 * подъём полагался на то, что система сожмёт окно (`adjustResize`). С
 * edge-to-edge (Expo 54+, Android 15) окно больше не сжимается, и клавиатура
 * просто накрывает нижние поля. Прокрутки к полю не было нигде.
 *
 * Как сделано: react-native-keyboard-controller (версия из комплекта Expo) —
 * стандартный способ в React Native, клавиатура отслеживается одинаково на
 * обеих платформах.
 *   - `FormKeyboardAvoidingView` — тот же подъём содержимого и нижних кнопок,
 *     но и на Android; `automaticOffset` сам учитывает шторки и заголовки.
 *   - `KeyboardDocked` — слой для кнопок, закреплённых внизу экрана
 *     (FormScreen, мастер задания): едет вверх вместе с клавиатурой и
 *     встаёт над ней; раскладка экрана при этом не сжимается, поэтому
 *     такие экраны обходятся без `FormKeyboardAvoidingView`.
 *   - `FormScrollView` — прокрутка, которая при фокусе держит поле над
 *     клавиатурой с запасом `bottomOffset` (у экранов с кнопкой, закреплённой
 *     внизу, — запас на её высоту). Позиция поля считается по окну, поэтому
 *     работает и внутри `FormKeyboardAvoidingView`.
 *   - Закрыть клавиатуру: касание пустого места (`keyboardShouldPersistTaps
 *     ="handled"`), смахивание списка вниз, клавиша «Готово» (Input ставит её
 *     по умолчанию), галочка над цифровой клавиатурой iOS (`KeyboardDone`).
 *
 * Корень приложения обёрнут в `KeyboardProvider` (app/_layout.tsx) — без
 * него компоненты библиотеки не получают событий клавиатуры.
 */

import { cssInterop } from "nativewind";
import type { ReactNode, Ref } from "react";
import { Platform, type ScrollView, StyleSheet } from "react-native";
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Компоненты библиотеки — не встроенные в react-native, NativeWind не знает
// про их className без явной регистрации.
cssInterop(KeyboardAvoidingView, { className: "style" });
cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

/** Расстояние от низа поля в фокусе до клавиатуры. */
export const KEYBOARD_FIELD_GAP = 24;

export function FormKeyboardAvoidingView({
  behavior = "padding",
  automaticOffset = true,
  ...props
}: KeyboardAvoidingViewProps & { className?: string }) {
  return <KeyboardAvoidingView behavior={behavior} automaticOffset={automaticOffset} {...props} />;
}

/**
 * Слой во весь экран (касания проходят насквозь) для нижних кнопок с
 * `position: absolute` и `bottom`. С открытой клавиатурой слой поднимается
 * на её высоту за вычетом нижнего отступа экрана — он и так под клавиатурой.
 */
export function KeyboardDocked({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardStickyView
      offset={{ opened: insets.bottom }}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      {children}
    </KeyboardStickyView>
  );
}

export function FormScrollView({
  bottomOffset = KEYBOARD_FIELD_GAP,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
  ref,
  ...props
}: KeyboardAwareScrollViewProps & {
  className?: string;
  contentContainerClassName?: string;
  /** Ref на ScrollView внутри (scrollTo и т.п.). */
  ref?: Ref<ScrollView>;
}) {
  return (
    <KeyboardAwareScrollView
      // KeyboardAwareScrollViewRef — тот же ScrollView плюс один метод.
      ref={ref as Ref<KeyboardAwareScrollViewRef>}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      {...props}
    />
  );
}
