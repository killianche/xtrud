// Экран ВХОДА (route /(auth)/phone — имя сохранено: на него ведут ссылки по
// проекту и LoginWall). Модель с 2026-06-05: «почта ИЛИ телефон» + пароль
// (SMS-OTP убран — платный). См. src/features/auth/use-auth-mutations.ts.
//
// После успешного входа НЕ навигируем вручную — корневой AuthGate сам уводит
// в онбординг / табы при появлении сессии.

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { CaretLeft, Eye, EyeSlash } from "phosphor-react-native";
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
import { useLogin } from "@/features/auth/use-auth-mutations";
import { type LoginFormValues, loginFormSchema } from "@/features/auth/validation";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const tc = useThemeColors(["muted-soft", "ink", "mute"]);
  const goBack = useSafeBack("/" as const);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { login: "", password: "" },
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login.mutateAsync({
        login: values.login.trim(),
        password: values.password,
      });
      // Навигацию делает AuthGate при появлении сессии.
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось войти");
    }
  });

  const isBusy = login.isPending;

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
        <View className="px-6 pt-4">
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
            Вход в xtrud
          </AppText>

          {/* Поле «Почта или телефон» */}
          <View className="mt-10">
            <AppText weight="medium" className="text-caption text-muted">
              Почта или телефон
            </AppText>
            <Controller
              control={control}
              name="login"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="example@mail.ru или +7 999…"
                  placeholderTextColor={tc["muted-soft"]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  // Поле принимает И почту, И телефон — даём обычную клавиатуру
                  // (inputMode="email" прятал цифры и затруднял ввод номера).
                  inputMode="text"
                  maxFontSizeMultiplier={1.3}
                  className={`mt-2 h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                    errors.login ? "border-error" : "border-hairline focus:border-ink"
                  }`}
                  editable={!isBusy}
                />
              )}
            />
            {errors.login && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {errors.login.message}
              </AppText>
            )}
          </View>

          {/* Поле «Пароль» с показать/скрыть */}
          <View className="mt-6">
            <AppText weight="medium" className="text-caption text-muted">
              Пароль
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
                    placeholder="Ваш пароль"
                    placeholderTextColor={tc["muted-soft"]}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    maxFontSizeMultiplier={1.3}
                    className={`h-12 flex-1 rounded-md border bg-canvas pl-3 pr-11 text-body-md text-ink ${
                      errors.password ? "border-error" : "border-hairline focus:border-ink"
                    }`}
                    editable={!isBusy}
                    onSubmitEditing={onSubmit}
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

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(auth)/forgot-password" as never)}
              hitSlop={6}
              className="mt-3 self-start active:opacity-70"
            >
              <AppText weight="medium" className="text-caption text-ink underline">
                Забыли пароль?
              </AppText>
            </Pressable>

            {serverError && (
              <AppText weight="medium" className="mt-4 text-caption text-error">
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
              {isBusy ? "Входим…" : "Войти"}
            </AppText>
          </Pressable>

          <View className="mt-6 flex-row items-center justify-center">
            <AppText className="text-body-sm text-body">Нет аккаунта? </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(auth)/register" as never)}
              hitSlop={6}
              className="active:opacity-70"
            >
              <AppText weight="semibold" className="text-body-sm text-ink underline">
                Зарегистрироваться
              </AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
