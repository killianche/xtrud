import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { CaretLeft } from "phosphor-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useVerifyOtp } from "@/features/auth/use-auth-mutations";
import {
  formatPhoneMask,
  normalizePhone,
  type PhoneFormValues,
  phoneFormSchema,
} from "@/features/auth/validation";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

export default function PhoneScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Sprint 1 dev-mode (фидбэк user 2026-05-16): экран /verify обходится
  // полностью, sign-in вызывается напрямую из этого экрана. Real OTP вернём
  // в Sprint 2 — тогда восстановим useSendOtp + переход на /verify.
  const verifyOtp = useVerifyOtp();
  const [serverError, setServerError] = useState<string | null>(null);
  const mutedSoftColor = useThemeColor("muted-soft");
  const inkColor = useThemeColor("ink");
  // Без back-кнопки пользователь, передумавший входить, оказывался в тупике
  // (web — нет swipe-back, mobile — нет header). safeBack возвращает либо на
  // предыдущий экран в стеке, либо на главную, если стек пуст (deeplink-вход).
  const goBack = useSafeBack("/" as const);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: "" },
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async (values) => {
    const phone = normalizePhone(values.phone);
    setServerError(null);
    try {
      await verifyOtp.mutateAsync({ phone, code: "" });
      // replace, чтобы кнопка «Назад» не возвращала на auth-экраны.
      router.replace("/(tabs)" as never);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось войти");
    }
  });

  const isBusy = verifyOtp.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-1 justify-between px-6 pt-4 pb-8">
        <View>
          {/* Back-кнопка — единственный путь выйти с этого экрана.
              На web нет swipe-back, и на native header не отображается
              (auth/_layout headerShown:false). Без неё пользователь, передумавший
              входить, оказывался в тупике. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={goBack}
            className="-ml-2 h-10 w-10 items-center justify-center rounded-full active:bg-canvas-soft"
          >
            <CaretLeft size={24} weight="bold" color={inkColor} />
          </Pressable>
          <AppText weight="bold" className="mt-6 text-display-md tracking-tight text-ink">
            Вход в xtrud
          </AppText>
          <AppText className="mt-3 text-body-md text-body">
            Введите номер телефона — войдёте моментально (dev-режим без СМС).
          </AppText>

          <View className="mt-10">
            <AppText weight="medium" className="text-caption text-muted">
              Номер телефона
            </AppText>
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  value={value}
                  onBlur={onBlur}
                  onChangeText={(raw) => onChange(formatPhoneMask(raw))}
                  placeholder="+7 ___ ___-__-__"
                  placeholderTextColor={mutedSoftColor}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  inputMode="tel"
                  maxFontSizeMultiplier={1.3}
                  className={`mt-2 h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                    errors.phone ? "border-error" : "border-hairline focus:border-ink"
                  }`}
                  // RN doesn't apply :focus via NativeWind on native; web only.
                  // Платформенно-нейтральный focus state — добавим в sprint 2 через onFocus state.
                  editable={!isBusy}
                />
              )}
            />
            {errors.phone && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {errors.phone.message}
              </AppText>
            )}
            {serverError && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {serverError}
              </AppText>
            )}
          </View>
        </View>

        <View>
          <Pressable
            accessibilityRole="button"
            disabled={!isValid || isBusy}
            onPress={onSubmit}
            className={`h-12 items-center justify-center rounded-md ${
              isValid && !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Входим..." : "Войти"}
            </AppText>
          </Pressable>

          <AppText className="mt-4 text-center text-caption-xs text-muted-soft">
            Продолжая, вы соглашаетесь с Условиями использования и Политикой конфиденциальности.
          </AppText>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
