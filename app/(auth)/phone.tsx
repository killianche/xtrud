// Экран ВХОДА (route /(auth)/phone — имя сохранено: на него ведут ссылки по
// проекту и LoginWall). С 2026-11-09 (№380, владелец: «полностью убери
// пароль») — номер и подтверждение звонком (PhoneSignInForm). Прежний вход
// «почта ИЛИ телефон» + пароль остаётся за флагом сервера passwordLogin.
//
// При обычном входе навигацию делает AuthGate. Если вход начат из формы
// задания, allowlist return-intent возвращает пользователя в сохранённый
// черновик; незавершённый onboarding при этом не обходится.

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { CaretLeft, Eye, EyeSlash } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, Input } from "@/components/ui";
import { FormScrollView } from "@/components/ui/KeyboardAware";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { ORDER_CREATE_RETURN_TO, parseAuthReturnTo } from "@/features/auth/auth-return";
import { PhoneSignInForm } from "@/features/auth/PhoneSignInForm";
import { setRegisterPrefill } from "@/features/auth/register-prefill";
import { useLogin } from "@/features/auth/use-auth-mutations";
import { usePasswordLogin } from "@/features/auth/use-auth-options";
import {
  type LoginFormValues,
  loginFormSchema,
  looksLikeEmail,
  normalizeRuPhoneDigits,
} from "@/features/auth/validation";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import {
  applyGuestDraftAuthAbandonment,
  completeGuestDraftAuthJourney,
  revokeGuestDraftAuthJourney,
  shouldAbandonGuestDraftAuthJourney,
} from "@/lib/order-draft-store";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function LoginScreen() {
  return usePasswordLogin() ? <PasswordLoginScreen /> : <PhoneLoginScreen />;
}

/**
 * Общее для обоих видов входа: возврат к черновику задания гостя и к экрану,
 * с которого пришли (return intent), «Назад» и переход в регистрацию.
 */
function useLoginJourney(isBusy: () => boolean) {
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
        // usePreventRemove blocks the actual transition while login is in
        // flight; the observer must not revoke the draft for that prevented
        // gesture/action.
        if (isBusy()) return;
        const action = event.data.action as { type: string; payload?: { name?: string } };
        abandonDraftJourney(
          shouldAbandonGuestDraftAuthJourney("phone", {
            type: action.type,
            targetRoute: action.payload?.name,
          }),
        );
      }),
    [abandonDraftJourney, isBusy, navigation],
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

  const openRegister = () => {
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
  };

  const afterSignIn = async (userId: string) => {
    await completeGuestDraftAuthJourney(draftJourney, userId);
    const returnUrl = useAuthReturnUrlStore.getState().peekReturnUrl();
    // Intent пока не consume: целевой экран проверит onboarding и только
    // после этого одноразово очистит return. Так AuthGate и network timing не
    // могут ни потерять возврат, ни пропустить обязательный onboarding.
    if (useAuthReturnUrlStore.getState().isPerformerOnboardingRequested()) {
      // AuthGate — единственный владелец performer branch/consume/redirect.
      // Здесь не конкурируем с ним за одноразовый return intent.
      return;
    } else if (returnUrl) {
      router.replace(returnUrl as never);
    }
  };

  return { abandonDraftJourney, goBack, openRegister, afterSignIn };
}

/** Номер → звонок → вход или регистрация (№380). */
function PhoneLoginScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const busy = useRef(false);
  const journey = useLoginJourney(useCallback(() => busy.current, []));

  return (
    <PhoneSignInForm
      topBar={(isBusy) => {
        busy.current = isBusy;
        return (
          <NavCircleButton label="Назад" onPress={journey.goBack} disabled={isBusy}>
            <SystemIcon
              sf="chevron.left"
              fallback={CaretLeft}
              size={20}
              weight="semibold"
              color={tc.ink}
            />
          </NavCircleButton>
        );
      }}
      onSignedIn={journey.afterSignIn}
      onNewUser={(phone, token) => {
        setRegisterPrefill(phone, "", token);
        journey.openRegister();
      }}
      onPasswordNeeded={(phone) =>
        router.push({ pathname: "/(auth)/sign-in", params: { phone } } as never)
      }
    />
  );
}

/** Прежний вход по паролю — только если сервер его вернул (passwordLogin). */
function PasswordLoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const tc = useThemeColors(["ink", "mute"]);
  const pending = useRef(false);
  pending.current = login.isPending;
  const { abandonDraftJourney, goBack, openRegister, afterSignIn } = useLoginJourney(
    useCallback(() => pending.current, []),
  );

  const {
    control,
    handleSubmit,
    getValues,
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
      await afterSignIn(result.userId);
    } catch (e) {
      // Такого номера нет — не заставляем набирать всё заново: регистрация
      // откроется с этим номером и паролем, останется имя и фамилия.
      const code = (e as { code?: unknown }).code;
      if (code === "account_not_found" && setRegisterPrefill(values.login, values.password)) {
        openRegister();
        return;
      }
      setServerError(e instanceof Error ? e.message : "Не удалось войти");
    }
  });

  const isBusy = login.isPending;
  useBackGestureLock(isBusy);

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <FormScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between" }}
        showsVerticalScrollIndicator={false}
      >
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
          {/* Стандарт auth-экранов 2026-09-02 (DECISION владельца: «всё
              бело-белое, непонятно, что где нажимать»): крупный заголовок,
              поля Input с заливкой и акцентной рамкой в фокусе, одна
              акцентная кнопка, ссылки в акценте. */}
          <AppText weight="bold" className="mt-6 text-ios-large-title text-ink">
            Вход в xtrud
          </AppText>

          <View className="mt-8">
            <Controller
              control={control}
              name="login"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  size="lg"
                  label="Телефон или почта"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="+7 999 123-45-67"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  // Поле принимает И телефон, И почту — обычная клавиатура
                  // (inputMode="email" прятал цифры и затруднял ввод номера).
                  inputMode="text"
                  editable={!isBusy}
                  error={errors.login?.message}
                />
              )}
            />
          </View>

          <View className="mt-5">
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  size="lg"
                  label="Пароль"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Ваш пароль"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  editable={!isBusy}
                  onSubmitEditing={onSubmit}
                  error={errors.password?.message}
                  rightIcon={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? "Скрыть пароль" : "Показать пароль"}
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={12}
                      className="h-11 w-11 items-center justify-center"
                    >
                      {showPassword ? (
                        <EyeSlash size={22} weight="bold" color={tc.mute} />
                      ) : (
                        <Eye size={22} weight="bold" color={tc.mute} />
                      )}
                    </Pressable>
                  }
                />
              )}
            />

            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => {
                abandonDraftJourney(true);
                // Номер из поля входа — сразу в заявку, чтобы не вводить
                // его второй раз.
                const login = getValues("login").trim();
                const digits = login && !looksLikeEmail(login) ? normalizeRuPhoneDigits(login) : "";
                router.push({
                  pathname: "/(auth)/forgot-password",
                  params: digits.length === 10 ? { phone: digits } : {},
                } as never);
              }}
              hitSlop={8}
              className={`mt-3 min-h-11 justify-center self-start ${isBusy ? "opacity-30" : "active:opacity-70"}`}
            >
              <AppText weight="semibold" className="text-ios-callout text-accent">
                Забыли пароль?
              </AppText>
            </Pressable>

            {serverError && (
              <View className="mt-4 rounded-xl bg-error-soft px-4 py-3">
                <AppText
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  weight="medium"
                  className="text-ios-callout text-error-deep"
                >
                  {serverError}
                </AppText>
              </View>
            )}
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
            Войти
          </Button>

          <View className="mt-6 flex-row items-center justify-center">
            <AppText className="text-ios-callout text-body">Нет аккаунта? </AppText>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={openRegister}
              hitSlop={8}
              className={`min-h-11 justify-center ${isBusy ? "opacity-30" : "active:opacity-70"}`}
            >
              <AppText weight="semibold" className="text-ios-callout text-accent">
                Зарегистрироваться
              </AppText>
            </Pressable>
          </View>
        </View>
      </FormScrollView>
    </View>
  );
}
