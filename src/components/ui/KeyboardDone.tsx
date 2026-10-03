/**
 * Кнопка «Готово» над цифровой клавиатурой (iOS).
 *
 * Владелец, 2026-10-03 (скриншот регистрации): «ввёл номер — и не знаю, как
 * закрыть клавиатуру; добавь галочку справа вверху над клавиатурой». У
 * цифровой и телефонной клавиатуры iOS нет клавиши Return — закрыть её
 * нечем. Родной механизм — InputAccessoryView: панель над клавиатурой,
 * которая появляется вместе с ней. Одна панель на всё приложение
 * (KeyboardDoneAccessory в app/_layout.tsx), поля ссылаются на неё по
 * KEYBOARD_DONE_ID. Input и ComposerField подключают её сами для
 * цифровых клавиатур; обычные TextInput — через keyboardDoneId().
 *
 * На Android у цифровой клавиатуры есть своя «готово», на вебе клавиатуры
 * нет — там ничего не рисуем.
 */

import { Check } from "phosphor-react-native";
import {
  InputAccessoryView,
  Keyboard,
  type KeyboardTypeOptions,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useThemeColors } from "@/lib/use-theme-color";

export const KEYBOARD_DONE_ID = "xtrud-keyboard-done";

const NO_RETURN_KEY: ReadonlySet<KeyboardTypeOptions> = new Set([
  "number-pad",
  "phone-pad",
  "numeric",
  "decimal-pad",
  "name-phone-pad",
] as KeyboardTypeOptions[]);

/** ID панели для поля, у клавиатуры которого нет клавиши Return; иначе undefined. */
export function keyboardDoneId(keyboardType: KeyboardTypeOptions | undefined): string | undefined {
  if (Platform.OS !== "ios" || !keyboardType) return undefined;
  return NO_RETURN_KEY.has(keyboardType) ? KEYBOARD_DONE_ID : undefined;
}

/** Панель над клавиатурой: справа — круглая кнопка с галочкой. Монтируется один раз. */
export function KeyboardDoneAccessory() {
  const tc = useThemeColors(["on-accent"]);
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID} backgroundColor="transparent">
      {/* Та же галочка, что у полей мастера создания задания
          (ComposerField): синий круг справа — владелец видел её там. */}
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
  );
}
