// Экран РЕГИСТРАЦИИ (route /(auth)/register). Модель с 2026-06-05: номер
// телефона (CountryCodeSelect + маска) + почта (для восстановления пароля) +
// пароль. Согласие с условиями обязательно (active opt-in) — гейтит кнопку.
//
// Полный E.164-номер собирается на submit: `+${country.dial}${digits}`.
// После успеха НЕ навигируем вручную — AuthGate уводит в онбординг при сессии.

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { CaretLeft, Check, Eye, EyeSlash } from "phosphor-react-native";
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
import {
  type Country,
  CountryCodeSelect,
  DEFAULT_COUNTRY,
} from "@/features/auth/CountryCodeSelect";
import { useRegister } from "@/features/auth/use-auth-mutations";
import {
  digitsOnly,
  type RegisterFormValues,
  registerFormSchema,
} from "@/features/auth/validation";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

/** Форматирование цифр в маску для конкретной страны.
 *  Для +7 (РФ/КЗ) — `XXX XXX-XX-XX`. Для остальных — группы по 3. */
function formatPhoneByCountry(digits: string, country: Country): string {
  const d = digits.slice(0, country.digitsLength);
  if (country.dial === "7") {
    let result = "";
    if (d.length > 0) result += d.slice(0, 3);
    if (d.length > 3) result += ` ${d.slice(3, 6)}`;
    if (d.length > 6) result += `-${d.slice(6, 8)}`;
    if (d.length > 8) result += `-${d.slice(8, 10)}`;
    return result;
  }
  return d.match(/.{1,3}/g)?.join(" ") ?? d;
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const register = useRegister();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const tc = useThemeColors(["muted-soft", "ink", "mute", "on-primary"]);
  const goBack = useSafeBack("/(auth)/phone" as const);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { phone: "", email: "", password: "" },
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async (values) => {
    const phone = `+${country.dial}${digitsOnly(values.phone)}`;
    setServerError(null);
    try {
      await register.mutateAsync({
        phone,
        email: values.email.trim(),
        password: values.password,
      });
      // Навигацию делает AuthGate при появлении сессии.
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось создать аккаунт");
    }
  });

  const isBusy = register.isPending;
  const canSubmit = isValid && acceptedTerms && !isBusy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            disabled={isBusy}
            onPress={goBack}
            className={`-ml-2 h-10 w-10 items-center justify-center rounded-full ${
              isBusy ? "opacity-30" : "active:bg-canvas-soft"
            }`}
          >
            <CaretLeft size={24} weight="bold" color={tc.ink} />
          </Pressable>
          <AppText weight="bold" className="mt-6 text-display-md tracking-tight text-ink">
            Создать аккаунт
          </AppText>

          {/* Поле «Номер телефона» */}
          <View className="mt-10">
            <AppText weight="medium" className="text-caption text-muted">
              Номер телефона
            </AppText>
            <View className="mt-2 flex-row gap-2">
              <CountryCodeSelect
                selected={country}
                onSelect={setCountry}
                disabled={isBusy}
              />
              <Controller
                control={control}
                name="phone"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    value={value}
                    onBlur={onBlur}
                    onChangeText={(raw) => onChange(formatPhoneByCountry(digitsOnly(raw), country))}
                    placeholder={country.dial === "7" ? "999 123-45-67" : "цифры номера"}
                    placeholderTextColor={tc["muted-soft"]}
                    keyboardType="phone-pad"
                    autoComplete="tel-national"
                    textContentType="telephoneNumber"
                    inputMode="tel"
                    maxFontSizeMultiplier={1.3}
                    className={`h-12 flex-1 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                      errors.phone ? "border-error" : "border-hairline focus:border-ink"
                    }`}
                    editable={!isBusy}
                  />
                )}
              />
            </View>
            {errors.phone && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {errors.phone.message}
              </AppText>
            )}
          </View>

          {/* Поле «Почта» */}
          <View className="mt-6">
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
                />
              )}
            />
            {errors.email && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {errors.email.message}
              </AppText>
            )}
          </View>

          {/* Поле «Пароль» с показать/скрыть. Лейбл «Минимум 6 символов» —
              лейбл ПОЛЯ (не subtitle под H1), правило §G не нарушается. */}
          <View className="mt-6">
            <AppText weight="medium" className="text-caption text-muted">
              Пароль · минимум 6 символов
            </AppText>
            <View className="mt-2 flex-row items-center">
              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    placeholder="Придумайте пароль"
                    placeholderTextColor={tc["muted-soft"]}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    maxFontSizeMultiplier={1.3}
                    className={`h-12 flex-1 rounded-md border bg-canvas pl-3 pr-11 text-body-md text-ink ${
                      errors.password ? "border-error" : "border-hairline focus:border-ink"
                    }`}
                    editable={!isBusy}
                  />
                )}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Скрыть пароль" : "Показать пароль"}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                className="absolute right-0 h-12 w-11 items-center justify-center"
              >
                {showPassword ? (
                  <EyeSlash size={20} weight="bold" color={tc.mute} />
                ) : (
                  <Eye size={20} weight="bold" color={tc.mute} />
                )}
              </Pressable>
            </View>
            {errors.password && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {errors.password.message}
              </AppText>
            )}
          </View>

          {/* Согласие с условиями (active opt-in) — гейтит кнопку. */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            accessibilityLabel="Я согласен с условиями использования и политикой конфиденциальности"
            onPress={() => setAcceptedTerms((v) => !v)}
            className="mt-6 flex-row items-start gap-3 active:opacity-70"
            hitSlop={4}
          >
            <View
              className={`mt-0.5 h-5 w-5 items-center justify-center rounded border-2 ${
                acceptedTerms ? "border-primary bg-primary" : "border-hairline bg-canvas"
              }`}
            >
              {acceptedTerms ? <Check size={14} weight="bold" color={tc["on-primary"]} /> : null}
            </View>
            <View className="flex-1 flex-row flex-wrap">
              <AppText className="text-caption text-body">Я согласен с </AppText>
              <AppText
                weight="medium"
                className="text-caption text-ink underline"
                onPress={() => router.push("/legal/terms" as never)}
              >
                Условиями использования
              </AppText>
              <AppText className="text-caption text-body"> и </AppText>
              <AppText
                weight="medium"
                className="text-caption text-ink underline"
                onPress={() => router.push("/legal/privacy" as never)}
              >
                Политикой конфиденциальности
              </AppText>
              <AppText className="text-caption text-body">.</AppText>
            </View>
          </Pressable>

          {serverError && (
            <AppText weight="medium" className="mt-4 text-caption text-error">
              {serverError}
            </AppText>
          )}
        </View>

        <View className="px-6 pb-8 pt-8">
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={onSubmit}
            className={`h-12 items-center justify-center rounded-md ${
              canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Создаём аккаунт…" : "Зарегистрироваться"}
            </AppText>
          </Pressable>

          <View className="mt-6 flex-row items-center justify-center">
            <AppText className="text-body-sm text-body">Уже есть аккаунт? </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(auth)/phone" as never)}
              hitSlop={6}
              className="active:opacity-70"
            >
              <AppText weight="semibold" className="text-body-sm text-ink underline">
                Войти
              </AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
