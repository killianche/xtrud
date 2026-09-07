// Экран «Забыли пароль» (route /(auth)/forgot-password). Модель с 2026-06-05:
// ввод почты → Supabase шлёт письмо со ссылкой на /reset-password. После успеха
// — success-состояние на том же экране (иконка письма + куда отправили + кнопка
// «Вернуться ко входу»).
//
// Текст «Откройте ссылку из письма на {email}…» — это объясняющий текст
// success-состояния, НЕ subtitle под H1 (правило §G не нарушается).
//
// Телефонные аккаунты (регистрация с 2026-09-01) почты не имеют: адрес для
// входа строится как `<цифры>@phone.xtrud.pro`, письма туда не доходят. Для
// них на экране есть врезка со ссылкой на поддержку — восстановление вручную
// (DECISION владельца 2026-09-03).

import { zodResolver } from "@hookform/resolvers/zod";
import { CaretLeft, EnvelopeSimple } from "phosphor-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, Input } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useRequestReset } from "@/features/auth/use-auth-mutations";
import { type ForgotPasswordValues, forgotPasswordSchema } from "@/features/auth/validation";
import { openExternalUrl } from "@/lib/open-link";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

// Email для связи мы принципиально не публикуем — только Telegram
// (то же правило, что в app/(details)/profile/settings.tsx).
const SUPPORT_TELEGRAM = "https://t.me/xtrud_support";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const requestReset = useRequestReset();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const tc = useThemeColors(["ink", "accent"]);
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
            <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
              <EnvelopeSimple size={36} weight="fill" color={tc.accent} />
            </View>
            <AppText weight="bold" className="mt-6 text-center text-display-md text-ink">
              Письмо отправлено
            </AppText>
            <AppText className="mt-3 max-w-[320px] text-center text-body-md text-body">
              Откройте ссылку из письма на {sentTo}, чтобы задать новый пароль.
            </AppText>
            <View className="mt-10 self-stretch">
              <Button variant="accent" size="lg" fullWidth onPress={goBack}>
                Вернуться ко входу
              </Button>
            </View>
          </View>
        ) : (
          // ── Форма: ввод почты ─────────────────────────────────────────────
          <>
            <View className="px-6 pt-4">
              <NavCircleButton label="Назад" onPress={goBack} disabled={isBusy}>
                <SystemIcon
                  sf="chevron.left"
                  fallback={CaretLeft}
                  size={20}
                  weight="semibold"
                  color={tc.ink}
                />
              </NavCircleButton>
              <AppText weight="bold" className="mt-6 text-display-lg text-ink">
                Восстановление пароля
              </AppText>

              <View className="mt-8">
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      size="lg"
                      label="Почта"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      placeholder="example@mail.ru"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      inputMode="email"
                      editable={!isBusy}
                      onSubmitEditing={onSubmit}
                      error={errors.email?.message}
                    />
                  )}
                />
                {serverError && (
                  <View className="mt-4 rounded-xl bg-error-soft px-4 py-3">
                    <AppText
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      weight="medium"
                      className="text-body-md text-error-deep"
                    >
                      {serverError}
                    </AppText>
                  </View>
                )}

                {/* Регистрация идёт по номеру телефона, и адрес для входа
                    строится синтетически: `<цифры>@phone.xtrud.pro`. Такого
                    почтового ящика не существует, письмо туда уйдёт в никуда.
                    Молчать об этом нельзя — человек будет ждать письма и
                    останется без аккаунта (design-quality §5: интерфейс не
                    утверждает того, чего нет).

                    DECISION владельца 2026-09-03: восстановление для таких
                    аккаунтов — вручную через поддержку. Отсюда и эта врезка. */}
                <View className="mt-8 rounded-xl border border-hairline bg-canvas-soft p-4">
                  <AppText weight="bold" className="text-title-md text-ink">
                    Регистрировались по номеру телефона?
                  </AppText>
                  <AppText className="mt-2 text-body-md text-body">
                    Тогда почты у аккаунта нет и письмо не придёт. Напишите нам — вернём доступ.
                  </AppText>
                  <View className="mt-4">
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      disabled={isBusy}
                      onPress={() => openExternalUrl(SUPPORT_TELEGRAM)}
                    >
                      Написать в поддержку
                    </Button>
                  </View>
                </View>
              </View>
            </View>

            <View className="px-6 pb-8 pt-8">
              <Button
                variant="accent"
                size="lg"
                fullWidth
                disabled={!isValid}
                loading={isBusy}
                onPress={onSubmit}
              >
                Отправить ссылку
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
