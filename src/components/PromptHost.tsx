/**
 * Окно ввода одной строки для Android (promptAsync, src/lib/prompt.ts) —
 * как системный диалог Material: заголовок, пояснение, поле, «Отмена» и
 * действие. На iOS и в вебе не рисуется: там системные окна.
 */

import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { usePromptStore } from "@/lib/prompt";
import { useThemeColors } from "@/lib/use-theme-color";

export function PromptHost() {
  const request = usePromptStore((s) => s.request);
  const close = usePromptStore((s) => s.close);
  const [text, setText] = useState("");
  const tc = useThemeColors(["ink", "mute"]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: новое окно — пустое поле.
  useEffect(() => {
    setText("");
  }, [request]);

  if (Platform.OS !== "android") return null;
  const value = text.trim();
  return (
    <Modal
      visible={!!request}
      transparent
      animationType="fade"
      onRequestClose={() => close(null)}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-8">
        <View className="w-full max-w-sm rounded-3xl bg-surface-card p-6">
          <AppText
            accessibilityRole="header"
            weight="semibold"
            className="text-ios-title3 text-ink"
          >
            {request?.title}
          </AppText>
          {request?.message ? (
            <AppText className="mt-2 text-ios-subheadline text-mute">{request.message}</AppText>
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder={request?.placeholder}
            placeholderTextColor={tc.mute}
            accessibilityLabel={request?.title}
            onSubmitEditing={() => value && close(value)}
            returnKeyType="done"
            className="mt-4 min-h-12 rounded-xl border border-hairline bg-canvas px-4 text-ios-body text-ink"
            style={{ color: tc.ink }}
          />
          <View className="mt-5 flex-row justify-end gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => close(null)}
              className="min-h-11 justify-center rounded-pill px-4 active:opacity-60"
            >
              <AppText weight="semibold" className="text-ios-body text-accent">
                Отмена
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !value }}
              disabled={!value}
              onPress={() => close(value)}
              className={`min-h-11 justify-center rounded-pill px-4 active:opacity-60 ${value ? "" : "opacity-40"}`}
            >
              <AppText weight="semibold" className="text-ios-body text-accent">
                {request?.confirmText ?? "Готово"}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
