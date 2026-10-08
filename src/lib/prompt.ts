/**
 * Системный ввод одной строки (причина блокировки и т.п.).
 * iOS — Alert.prompt, как в системных приложениях; веб — window.prompt;
 * Android — своё окно PromptHost (src/components/PromptHost.tsx): у Android
 * нет Alert.prompt, и раньше здесь возвращался null — админские «Скрыть»,
 * «Заблокировать» и решения по жалобам молча ничего не делали (аудит №298).
 */
import { Alert, Platform } from "react-native";
import { create } from "zustand";

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  confirmText?: string;
}

interface PromptRequest extends PromptOptions {
  resolve: (value: string | null) => void;
}

/** Открытый запрос для PromptHost (только Android). */
export const usePromptStore = create<{
  request: PromptRequest | null;
  close: (value: string | null) => void;
}>((set, get) => ({
  request: null,
  close: (value) => {
    get().request?.resolve(value);
    set({ request: null });
  },
}));

export function promptAsync(opts: PromptOptions): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return Promise.resolve(null);
    const text = window.prompt(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title, "");
    return Promise.resolve(text?.trim() || null);
  }
  if (Platform.OS !== "ios") {
    return new Promise((resolve) => {
      // Предыдущий незакрытый запрос — отменяется, а не висит.
      usePromptStore.getState().request?.resolve(null);
      usePromptStore.setState({ request: { ...opts, resolve } });
    });
  }
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
