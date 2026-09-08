/**
 * Системный ввод одной строки (причина блокировки и т.п.). На iOS —
 * Alert.prompt, как в системных приложениях; на других платформах — null.
 */
import { Alert, Platform } from "react-native";

export function promptAsync(opts: {
  title: string;
  message?: string;
  placeholder?: string;
  confirmText?: string;
}): Promise<string | null> {
  if (Platform.OS !== "ios") return Promise.resolve(null);
  return new Promise((resolve) => {
    Alert.prompt(
      opts.title,
      opts.message,
      [
        { text: "Отмена", style: "cancel", onPress: () => resolve(null) },
        {
          text: opts.confirmText ?? "Готово",
          onPress: (text?: string) => resolve((text ?? "").trim() || null),
        },
      ],
      "plain-text",
      "",
      "default",
    );
  });
}
