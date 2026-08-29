// Экран «Забыли пароль» (route /(auth)/forgot-password). Модель с 2026-06-05:
// ввод почты → Supabase шлёт письмо со ссылкой на /reset-password. После успеха
// — success-состояние на том же экране (иконка письма + куда отправили + кнопка
// «Вернуться ко входу»).
//
// Текст «Откройте ссылку из письма на {email}…» — это объясняющий текст
// success-состояния, НЕ subtitle под H1 (правило §G не нарушается).

import { zodResolver } from "@hookform/resolvers/zod";
import { CaretLeft, EnvelopeSimple } from "phosphor-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useRequestReset } from "@/features/auth/use-auth-mutations";
import { type ForgotPasswordValues, forgotPasswordSchema } from "@/features/auth/validation";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const requestReset = useRequestReset();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const tc = useThemeColors(["muted-soft", "ink", "accent"]);
  const goBack = useSafeBack("/(auth)/phone" as const);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async (values) => {
    const email = values.email.trim();
    setServerError(null);
    try {
      await requestReset.mutateAsync(email);
      setSentTo(email);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось отправить письмо");
    }
  });

  const isBusy = requestReset.isPending;
  useBackGestureLock(isBusy);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between" }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {sentTo ? (
          // ── Success-состояние: письмо отправлено ──────────────────────────
          <View className="flex-1 items-center justify-center px-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
              <EnvelopeSimple size={32} weight="fill" color={tc.accent} />
            </View>
            <AppText
              weight="bold"
              className="mt-6 text-center text-display-md tracking-tight text-ink"
            >
              Письмо отправлено
            </AppText>
            <AppText className="mt-3 max-w-[300px] text-center text-body-md text-body">
              Откройте ссылку из письма на {sentTo}, чтобы задать новый пароль.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={goBack}
              className="mt-10 h-12 w-full items-center justify-center rounded-md bg-primary active:opacity-80"
            >
              <AppText weight="semibold" className="text-button text-on-primary">
                Вернуться ко входу
              </AppText>
            </Pressable>
          </View>
        ) : (
          // ── Форма: ввод почты ─────────────────────────────────────────────
          <>
            <View className="px-6 pt-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Назад"
                disabled={isBusy}
                onPress={goBack}
                className={`-ml-2 h-12 w-12 items-center justify-center rounded-full ${
                  isBusy ? "opacity-30" : "active:bg-canvas-soft"
                }`}
              >
                <CaretLeft size={28} weight="bold" color={tc.ink} />
              </Pressable>
              <AppText weight="bold" className="mt-6 text-display-md tracking-tight text-ink">
                Восстановление пароля
              </AppText>

              <View className="mt-10">
                <AppText weight="medium" className="text-caption text-muted">
                  Почта
                </AppText>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      placeholder="example@mail.ru"
                      placeholderTextColor={tc["muted-soft"]}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      inputMode="email"
                      maxFontSizeMultiplier={1.3}
                      className={`mt-2 h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                        errors.email ? "border-error" : "border-hairline focus:border-ink"
                      }`}
                      editable={!isBusy}
                      onSubmitEditing={onSubmit}
                    />
                  )}
                />
                {errors.email && (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.email.message}
                  </AppText>
                )}
                {serverError && (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {serverError}
                  </AppText>
                )}
              </View>
            </View>

            <View className="px-6 pb-8 pt-8">
              <Pressable
                accessibilityRole="button"
                disabled={!isValid || isBusy}
                onPress={onSubmit}
                className={`h-12 items-center justify-center rounded-md ${
                  isValid && !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
                }`}
              >
                <AppText weight="semibold" className="text-button text-on-primary">
                  {isBusy ? "Отправляем…" : "Отправить ссылку"}
                </AppText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
