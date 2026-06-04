// Экран «Новый пароль» (top-level route /reset-password — НЕ внутри (auth)).
// Цель ссылки из письма (xtrud.pro/reset-password). На web Supabase сам
// подхватывает recovery-токен из URL (detectSessionInUrl=true) и создаёт сессию;
// AuthGate в app/_layout.tsx пропускает группу "reset-password" во всех ветках.
//
// Три состояния:
//   checking  — ждём решения есть ли recovery-сессия (короткий skeleton).
//   form      — сессия есть → ввод нового пароля + повтор (zod refine).
//   invalid   — открыли без токена / устарело → CTA «Запросить заново».
//   done      — пароль изменён → CTA «Войти» (recovery-сессия = уже залогинен).

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { CheckCircle, Eye, EyeSlash, WarningCircle } from "phosphor-react-native";
import { useEffect, useState } from "react";
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
import { z } from "zod";
import { AppText } from "@/components/AppText";
import { useUpdatePassword } from "@/features/auth/use-auth-mutations";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";

// Локальная схема: новый пароль (мин. 6) + повтор (должен совпадать).
const resetPasswordSchema = z
  .object({
    password: z.string().min(6, "Минимум 6 символов"),
    confirm: z.string().min(1, "Повторите пароль"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Пароли не совпадают",
    path: ["confirm"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

type Phase = "checking" | "form" | "invalid" | "done";

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const updatePassword = useUpdatePassword();
  const [phase, setPhase] = useState<Phase>("checking");
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const tc = useThemeColors(["muted-soft", "ink", "mute", "accent", "error"]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
    mode: "onChange",
  });

  // Определяем есть ли recovery-сессия. Supabase подхватывает токен из URL
  // асинхронно (detectSessionInUrl) — поэтому слушаем onAuthStateChange и
  // одновременно сразу читаем getSession. Если за ~1.5с сессии нет — invalid.
  useEffect(() => {
    let mounted = true;
    let settled = false;

    const resolve = (hasSession: boolean) => {
      if (!mounted || settled) return;
      settled = true;
      setPhase(hasSession ? "form" : "invalid");
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) resolve(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) resolve(true);
    });

    // Окно ожидания на подхват токена из URL. Если ничего не пришло — invalid.
    const timer = setTimeout(() => resolve(false), 1500);

    return () => {
      mounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await updatePassword.mutateAsync(values.password);
      setPhase("done");
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось изменить пароль");
    }
  });

  const isBusy = updatePassword.isPending;

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
        {phase === "checking" && (
          // Короткий skeleton пока решаем есть ли recovery-сессия.
          <View className="flex-1 px-6 pt-16">
            <View className="h-8 w-2/3 rounded-md bg-surface-3" />
            <View className="mt-10 h-12 w-full rounded-md bg-surface-3" />
            <View className="mt-6 h-12 w-full rounded-md bg-surface-3" />
          </View>
        )}

        {phase === "invalid" && (
          <View className="flex-1 items-center justify-center px-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-error-soft">
              <WarningCircle size={32} weight="fill" color={tc.error} />
            </View>
            <AppText
              weight="bold"
              className="mt-6 text-center text-display-md tracking-tight text-ink"
            >
              Ссылка недействительна
            </AppText>
            <AppText className="mt-3 max-w-[300px] text-center text-body-md text-body">
              Ссылка для сброса пароля устарела или уже использована. Запросите новую.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/(auth)/forgot-password" as never)}
              className="mt-10 h-12 w-full items-center justify-center rounded-md bg-primary active:opacity-80"
            >
              <AppText weight="semibold" className="text-button text-on-primary">
                Запросить заново
              </AppText>
            </Pressable>
          </View>
        )}

        {phase === "done" && (
          <View className="flex-1 items-center justify-center px-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
              <CheckCircle size={32} weight="fill" color={tc.accent} />
            </View>
            <AppText
              weight="bold"
              className="mt-6 text-center text-display-md tracking-tight text-ink"
            >
              Пароль изменён
            </AppText>
            <AppText className="mt-3 max-w-[300px] text-center text-body-md text-body">
              Теперь можно пользоваться приложением с новым паролем.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/(tabs)" as never)}
              className="mt-10 h-12 w-full items-center justify-center rounded-md bg-primary active:opacity-80"
            >
              <AppText weight="semibold" className="text-button text-on-primary">
                Войти
              </AppText>
            </Pressable>
          </View>
        )}

        {phase === "form" && (
          <>
            <View className="px-6 pt-16">
              <AppText
                weight="bold"
                className="text-display-md tracking-tight text-ink"
              >
                Новый пароль
              </AppText>

              {/* Поле «Новый пароль» с показать/скрыть */}
              <View className="mt-10">
                <AppText weight="medium" className="text-caption text-muted">
                  Новый пароль · минимум 6 символов
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

              {/* Поле «Повторите пароль» */}
              <View className="mt-6">
                <AppText weight="medium" className="text-caption text-muted">
                  Повторите пароль
                </AppText>
                <Controller
                  control={control}
                  name="confirm"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      placeholder="Ещё раз тот же пароль"
                      placeholderTextColor={tc["muted-soft"]}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      maxFontSizeMultiplier={1.3}
                      className={`mt-2 h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                        errors.confirm ? "border-error" : "border-hairline focus:border-ink"
                      }`}
                      editable={!isBusy}
                      onSubmitEditing={onSubmit}
                    />
                  )}
                />
                {errors.confirm && (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.confirm.message}
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
                  {isBusy ? "Сохраняем…" : "Сохранить пароль"}
                </AppText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
