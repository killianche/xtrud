/**
 * showAlert — короткое сообщение с одной кнопкой «ОК» (ошибка, «готово»).
 *
 * Общий адаптер вместо голого `Alert.alert` (аудит 2026-10-05, §4;
 * docs/IOS_FOUNDATION.md §10: «нет Alert.alert в обход общих адаптеров»).
 * На iPhone и Android — то же системное окно (Alert.alert), в веб-сборке —
 * окно браузера: `Alert.alert` там ничего не показывает, и ошибка терялась
 * бы, а проверки снимками на VDS её не видели.
 *
 * Подтверждения «Да / Нет» — `confirmAsync` (src/lib/confirm.ts); выбор из
 * нескольких действий — `chooseAsync` ниже.
 */

import { Alert, Platform } from "react-native";

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export interface ChoiceOption<T extends string> {
  id: T;
  text: string;
  destructive?: boolean;
}

/**
 * Выбор одного действия из нескольких (плюс «Отмена») — системное окно.
 * Возвращает id выбранного или null (отмена). В веб-сборке — по очереди
 * `window.confirm` на каждое действие (редкий путь проверки, не основной).
 */
export function chooseAsync<T extends string>(opts: {
  title: string;
  message?: string;
  options: ChoiceOption<T>[];
  cancelText?: string;
}): Promise<T | null> {
  const { title, message, options, cancelText = "Отмена" } = opts;
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return Promise.resolve(null);
    for (const o of options) {
      if (window.confirm(`${title}${message ? `\n\n${message}` : ""}\n\n${o.text}?`)) {
        return Promise.resolve(o.id);
      }
    }
    return Promise.resolve(null);
  }
  return new Promise<T | null>((resolve) => {
    // «Отмена» первой: на Android порядок кнопок фиксирован (последняя —
    // самая заметная справа), а iOS сам ставит кнопку стиля cancel на её
    // место (замечание Android-сессии 2026-10-05).
    Alert.alert(title, message, [
      { text: cancelText, style: "cancel" as const, onPress: () => resolve(null) },
      ...options.map((o) => ({
        text: o.text,
        style: o.destructive ? ("destructive" as const) : ("default" as const),
        onPress: () => resolve(o.id),
      })),
    ]);
  });
}
