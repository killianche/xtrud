/**
 * Меню действий («⋯») — одно для всего приложения (№276).
 *
 * На iPhone — системный список действий (ActionSheetIOS). На Android его нет:
 * прямой вызов ActionSheetIOS там падал «ActionSheetManager doesn't exist»
 * (13 падений 2026-10-05…07 в client_errors, в т.ч. рабочая 1.0.5) —
 * поэтому системное окно Android: до трёх действий, «Отмена» — касание
 * мимо окна. В веб-сборке — по очереди window.confirm (путь проверки).
 */

import { ActionSheetIOS, Alert, Platform } from "react-native";

export interface ActionMenuItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export function showActionMenu(opts: {
  title?: string;
  message?: string;
  items: readonly ActionMenuItem[];
  colorScheme?: "light" | "dark";
}): void {
  const { title, message, items, colorScheme } = opts;
  if (items.length === 0) return;
  if (Platform.OS === "ios") {
    const cancelButtonIndex = items.length;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...items.map((i) => i.label), "Отмена"],
        cancelButtonIndex,
        destructiveButtonIndex: items.map((i, n) => (i.destructive ? n : -1)).filter((n) => n >= 0),
        userInterfaceStyle: colorScheme,
      },
      (n) => {
        if (n !== cancelButtonIndex) items[n]?.onPress();
      },
    );
    return;
  }
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;
    for (const item of items) {
      if (window.confirm(`${title ?? ""}${message ? `\n\n${message}` : ""}\n\n${item.label}?`)) {
        item.onPress();
        return;
      }
    }
    return;
  }
  // Android: окно показывает не больше трёх кнопок.
  Alert.alert(
    title ?? "",
    message,
    items.slice(0, 3).map((i) => ({
      text: i.label,
      style: i.destructive ? ("destructive" as const) : ("default" as const),
      onPress: i.onPress,
    })),
    { cancelable: true },
  );
}
