// Экран ВХОДА (route /(auth)/phone — имя сохранено: на него ведут ссылки по
// проекту и LoginWall). Модель с 2026-06-05: «почта ИЛИ телефон» + пароль
// (SMS-OTP убран — платный). См. src/features/auth/use-auth-mutations.ts.
//
// При обычном входе навигацию делает AuthGate. Если вход начат из формы
// задания, allowlist return-intent возвращает пользователя в сохранённый
// черновик; незавершённый onboarding при этом не обходится.

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { CaretLeft, Eye, EyeSlash } from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
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
import { ORDER_CREATE_RETURN_TO, parseAuthReturnTo } from "@/features/auth/auth-return";
import { useLogin } from "@/features/auth/use-auth-mutations";
import { type LoginFormValues, loginFormSchema } from "@/features/auth/validation";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import {
  applyGuestDraftAuthAbandonment,
  completeGuestDraftAuthJourney,
  revokeGuestDraftAuthJourney,
  shouldAbandonGuestDraftAuthJourney,
} from "@/lib/order-draft-store";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    draftJourney?: string | string[];
  }>();
  const requestedReturnTo = parseAuthReturnTo(params.returnTo);
  const draftJourney = Array.isArray(params.draftJourney)
    ? params.draftJourney[0]
    : params.draftJourney;
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const tc = useThemeColors(["muted-soft", "ink", "mute"]);
  const safeGoBack = useSafeBack("/" as const);

  const abandonDraftJourney = useCallback((shouldAbandon: boolean) => {
    applyGuestDraftAuthAbandonment(shouldAbandon, {
      clearReturnIntent: () => {
        const returnUrl = useAuthReturnUrlStore.getState().peekReturnUrl();
        if (returnUrl === ORDER_CREATE_RETURN_TO) {
          useAuthReturnUrlStore.getState().clearReturnUrl();
        }
      },
      revokeJourney: revokeGuestDraftAuthJourney,
    });
  }, []);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        const action = event.data.action as { type: string; payload?: { name?: string } };
        abandonDraftJourney(
          shouldAbandonGuestDraftAuthJourney("phone", {
            type: action.type,
            targetRoute: action.payload?.name,
          }),
        );
      }),
    [abandonDraftJourney, navigation],
  );

  useEffect(() => {
    if (requestedReturnTo) {
      useAuthReturnUrlStore.getState().setReturnUrl(requestedReturnTo);
    }
  }, [requestedReturnTo]);

  const goBack = () => {
    // useSafeBack завершает переход через REPLACE, который lifecycle-policy
    // считает успешной auth-навигацией. Поэтому видимая кнопка Back обязана
    // явно отозвать гостевой journey до самого перехода.
    abandonDraftJourney(true);
    safeGoBack();
  };

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
      const result = await login.mutateAsync({
        login: values.login.trim(),
        password: values.password,
      });
      await completeGuestDraftAuthJourney(draftJourney, result.userId);
      const returnUrl = useAuthReturnUrlStore.getState().peekReturnUrl();
      // Intent пока не consume: целевой экран проверит onboarding и только
      // после этого одноразово очистит return. Так AuthGate и network timing не
      // могут ни потерять возврат, ни пропустить обязательный onboarding.
      if (returnUrl) router.replace(returnUrl as never);
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
              onPress={() => {
                abandonDraftJourney(true);
                router.push("/(auth)/forgot-password" as never);
              }}
              hitSlop={6}
              className="mt-3 self-start active:opacity-70"
            >
              <AppText weight="medium" className="text-caption text-ink underline">
                Забыли пароль?
              </AppText>
            </Pressable>

            {serverError && (
              <AppText
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                weight="medium"
                className="mt-4 text-caption text-error"
              >
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
              onPress={() => {
                router.push(
                  requestedReturnTo
                    ? ({
                        pathname: "/(auth)/register",
                        params: {
                          returnTo: requestedReturnTo,
                          ...(draftJourney ? { draftJourney } : {}),
                          authOrigin: "phone",
                        },
                      } as never)
                    : ("/(auth)/register" as never),
                );
              }}
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
