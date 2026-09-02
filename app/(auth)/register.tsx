// Экран РЕГИСТРАЦИИ (route /(auth)/register). Модель с 2026-06-05: номер
// телефона (CountryCodeSelect + маска) + почта (для восстановления пароля) +
// пароль. Согласие с условиями обязательно (active opt-in) — гейтит кнопку.
//
// Полный E.164-номер собирается на submit: `+${country.dial}${digits}`.
// После обычной регистрации AuthGate уводит в onboarding. Если регистрация
// начата из формы задания, return-intent остаётся до завершения обязательного
// onboarding и потребляется там ровно один раз.

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { CaretLeft, Check, Eye, EyeSlash } from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, Input } from "@/components/ui";
import { ORDER_CREATE_RETURN_TO, parseAuthReturnTo } from "@/features/auth/auth-return";
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
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import {
  applyGuestDraftAuthAbandonment,
  completeGuestDraftAuthJourney,
  type GuestDraftAuthOrigin,
  revokeGuestDraftAuthJourney,
  shouldAbandonGuestDraftAuthJourney,
} from "@/lib/order-draft-store";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
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
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    draftJourney?: string | string[];
    authOrigin?: string | string[];
  }>();
  const requestedReturnTo = parseAuthReturnTo(params.returnTo);
  const draftJourney = Array.isArray(params.draftJourney)
    ? params.draftJourney[0]
    : params.draftJourney;
  const rawAuthOrigin = Array.isArray(params.authOrigin) ? params.authOrigin[0] : params.authOrigin;
  const authOrigin: GuestDraftAuthOrigin =
    rawAuthOrigin === "phone" || rawAuthOrigin === "sheet" ? rawAuthOrigin : null;
  const register = useRegister();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const tc = useThemeColors(["ink", "mute", "on-accent"]);
  const safeGoBack = useSafeBack("/(auth)/phone" as const);

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
        if (register.isPending) return;
        const action = event.data.action as { type: string; payload?: { name?: string } };
        abandonDraftJourney(
          shouldAbandonGuestDraftAuthJourney(
            "register",
            { type: action.type, targetRoute: action.payload?.name },
            authOrigin,
          ),
        );
      }),
    [abandonDraftJourney, authOrigin, navigation, register.isPending],
  );

  useEffect(() => {
    if (requestedReturnTo) {
      useAuthReturnUrlStore.getState().setReturnUrl(requestedReturnTo);
    }
  }, [requestedReturnTo]);

  const goBack = () => {
    if (requestedReturnTo) {
      if (authOrigin === "phone") {
        // Phone is already the previous native Stack screen with the same
        // return params. Pop it instead of creating a duplicate via replace.
        safeGoBack();
        return;
      }
      abandonDraftJourney(true);
    }
    safeGoBack();
  };

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { phone: "", password: "" },
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async (values) => {
    const phone = `+${country.dial}${digitsOnly(values.phone)}`;
    setServerError(null);
    try {
      const result = await register.mutateAsync({
        phone,
        password: values.password,
      });
      await completeGuestDraftAuthJourney(draftJourney, result.userId);
      if (useAuthReturnUrlStore.getState().peekReturnUrl()) {
        if (useAuthReturnUrlStore.getState().isPerformerOnboardingRequested()) {
          // AuthGate owns performer routing after the session/user row settles.
          return;
        }
        router.replace("/(onboarding)/client-name" as never);
      }
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось создать аккаунт");
    }
  });

  const isBusy = register.isPending;
  useBackGestureLock(isBusy);
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
            className={`-ml-2 h-12 w-12 items-center justify-center rounded-full ${
              isBusy ? "opacity-30" : "active:bg-canvas-soft"
            }`}
          >
            <CaretLeft size={28} weight="bold" color={tc.ink} />
          </Pressable>
          {/* Стандарт auth-экранов 2026-09-02 — см. app/(auth)/phone.tsx. */}
          <AppText weight="bold" className="mt-6 text-display-lg text-ink">
            Создать аккаунт
          </AppText>

          <View className="mt-8">
            <AppText weight="semibold" className="mb-2 text-body-md text-ink">
              Номер телефона
            </AppText>
            <View className="flex-row items-start gap-2">
              <CountryCodeSelect selected={country} onSelect={setCountry} disabled={isBusy} />
              <View className="flex-1">
                <Controller
                  control={control}
                  name="phone"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      size="lg"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={(raw) =>
                        onChange(formatPhoneByCountry(digitsOnly(raw), country))
                      }
                      placeholder={country.dial === "7" ? "999 123-45-67" : "цифры номера"}
                      keyboardType="phone-pad"
                      autoComplete="tel-national"
                      textContentType="telephoneNumber"
                      inputMode="tel"
                      editable={!isBusy}
                      error={errors.phone?.message}
                    />
                  )}
                />
              </View>
            </View>
          </View>

          {/* «Минимум 6 символов» — лейбл ПОЛЯ (не subtitle под H1), §G не
              нарушается. */}
          <View className="mt-5">
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  size="lg"
                  label="Пароль · минимум 6 символов"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Придумайте пароль"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  editable={!isBusy}
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
          </View>

          {/* Согласие с условиями (active opt-in) — гейтит кнопку. */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            accessibilityLabel="Я согласен с условиями использования и политикой конфиденциальности"
            onPress={() => setAcceptedTerms((v) => !v)}
            className="mt-6 min-h-11 flex-row items-start gap-3 active:opacity-70"
            hitSlop={4}
          >
            <View
              className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border-2 ${
                acceptedTerms ? "border-accent bg-accent" : "border-hairline-strong bg-canvas-soft"
              }`}
            >
              {acceptedTerms ? <Check size={16} weight="bold" color={tc["on-accent"]} /> : null}
            </View>
            {/* Ссылки — Pressable с ролью link и вертикальным hitSlop: строка
                текста 24 pt, зона касания добирается до 44 pt (QA 2026-09-02). */}
            <View className="flex-1 flex-row flex-wrap items-center">
              <AppText className="text-body-md text-body">Я согласен с </AppText>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Условия использования"
                disabled={isBusy}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                onPress={() => router.push("/legal/terms" as never)}
              >
                <AppText weight="semibold" className="text-body-md text-accent">
                  Условиями использования
                </AppText>
              </Pressable>
              <AppText className="text-body-md text-body"> и </AppText>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Политика конфиденциальности"
                disabled={isBusy}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                onPress={() => router.push("/legal/privacy" as never)}
              >
                <AppText weight="semibold" className="text-body-md text-accent">
                  Политикой конфиденциальности
                </AppText>
              </Pressable>
              <AppText className="text-body-md text-body">.</AppText>
            </View>
          </Pressable>

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
        </View>

        <View className="px-6 pb-8 pt-8">
          <Button
            variant="accent"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            loading={isBusy}
            onPress={onSubmit}
          >
            Зарегистрироваться
          </Button>

          <View className="mt-6 flex-row items-center justify-center">
            <AppText className="text-body-md text-body">Уже есть аккаунт? </AppText>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => {
                if (authOrigin === "phone") {
                  goBack();
                  return;
                }
                // Switching auth mode from a direct registration entry is a
                // replacement, not a new level users should return to.
                router.replace(
                  requestedReturnTo
                    ? ({
                        pathname: "/(auth)/phone",
                        params: {
                          returnTo: requestedReturnTo,
                          ...(draftJourney ? { draftJourney } : {}),
                        },
                      } as never)
                    : ("/(auth)/phone" as never),
                );
              }}
              hitSlop={8}
              className={`min-h-11 justify-center ${isBusy ? "opacity-30" : "active:opacity-70"}`}
            >
              <AppText weight="semibold" className="text-body-md text-accent">
                Войти
              </AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
