// Экран РЕГИСТРАЦИИ (route /(auth)/register).
//
// «Тестовая регистрация» — DECISION владельца 2026-09-03: имя, фамилия, номер
// телефона и пароль. Ни SMS, ни почты, ни подтверждения: нажал «Создать
// аккаунт» — аккаунт есть. Подтверждение номера по SMS вернём отдельным
// этапом, когда будет провайдер.
//
// Номер — единственный формат: код страны зафиксирован на +7 и не
// выбирается, в поле ровно 10 цифр. Раньше здесь был CountryCodeSelect, и
// один и тот же человек мог зарегистрироваться как 8928… , а войти как
// 7928…. Ввод нормализуется на каждый символ (normalizeRuPhoneDigits), а
// сервер ищет аккаунт по последним 10 цифрам (RPC resolve_login_email) —
// форматы совпадают с обеих сторон.
//
// Имя с фамилией пишутся сразу после входа, там же закрывается онбординг:
// отдельного экрана «как вас зовут» после регистрации больше нет.

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { CaretLeft } from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { ORDER_CREATE_RETURN_TO, parseAuthReturnTo } from "@/features/auth/auth-return";
import { formatRuPhone, RegisterFormFields } from "@/features/auth/RegisterFormFields";
import { clearRegisterPrefill, peekRegisterPrefill } from "@/features/auth/register-prefill";
import { useRegisterWithCode } from "@/features/auth/use-register-with-code";
import {
  normalizeRuPhoneDigits,
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
  // Подтверждение номера звонком — если сервер его требует (№206).
  const register = useRegisterWithCode();
  const [serverError, setServerError] = useState<string | null>(null);
  const [_showPassword, _setShowPassword] = useState(false);
  // Галочка стоит сразу (DECISION владельца 2026-09-12: «ставь»): человек
  // видит ссылки на условия рядом с кнопкой и может снять отметку.
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const tc = useThemeColors(["ink", "mute", "on-accent"]);
  const safeGoBack = useSafeBack("/(auth)/phone" as const);
  // Пришли со входа по номеру, которого нет: номер и пароль уже введены там.
  const [prefill] = useState(peekRegisterPrefill);

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
    trigger,
    watch,
    formState: { errors, isValid },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: prefill?.phone ?? "",
      password: prefill?.password ?? "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    // Забираем один раз: следующий заход в регистрацию — с пустой формой.
    clearRegisterPrefill();
    // Пароль со входа короче 8 знаков — сразу показываем, что его поменять.
    // С «Ваш номер» пароля ещё нет — ошибку до ввода не показываем.
    if (prefill?.password) void trigger("password");
  }, [prefill, trigger]);

  const onSubmit = handleSubmit(async (values) => {
    // Номер всегда российский и всегда в одном виде: +7 и десять цифр.
    const phone = `+7${normalizeRuPhoneDigits(values.phone)}`;
    setServerError(null);
    try {
      const result = await register.run(
        {
          phone,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
        },
        prefill?.verificationToken
          ? { phone: `+7${prefill.phone}`, token: prefill.verificationToken }
          : undefined,
      );
      // Шторку звонка закрыли — остаёмся на форме.
      if (!result) return;
      await completeGuestDraftAuthJourney(draftJourney, result.userId);
      const returnUrl = useAuthReturnUrlStore.getState().peekReturnUrl();
      if (returnUrl) {
        if (useAuthReturnUrlStore.getState().isPerformerOnboardingRequested()) {
          // AuthGate owns performer routing after the session/user row settles.
          return;
        }
        // Гость пришёл откликнуться на задание (DECISION владельца 2026-09-06):
        // после регистрации — обратно к нему, а не на главную. Intent не
        // consume здесь: его одноразово снимет сам экран задания.
        if (returnUrl !== ORDER_CREATE_RETURN_TO) {
          router.replace(returnUrl as never);
          return;
        }
      }
      // Имя и онбординг закрыты внутри регистрации, поэтому идём сразу в
      // приложение. Возврат к черновику задания, если он был, сделает AuthGate.
      router.replace("/(tabs)" as never);
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
          <NavCircleButton label="Назад" onPress={goBack} disabled={isBusy}>
            <SystemIcon
              sf="chevron.left"
              fallback={CaretLeft}
              size={20}
              weight="semibold"
              color={tc.ink}
            />
          </NavCircleButton>
          {/* Стандарт auth-экранов 2026-09-02 — см. app/(auth)/phone.tsx. */}
          <AppText weight="bold" className="mt-6 text-ios-large-title text-ink">
            Создать аккаунт
          </AppText>
          {prefill ? (
            <View className="mt-4 rounded-xl bg-canvas-soft px-4 py-3">
              <AppText accessibilityRole="alert" className="text-ios-callout text-body">
                {/* «Подтверждён» — только пока в поле тот же номер (QA: поменяли
                    номер — подтверждения для нового нет, спросим звонок). */}
                {prefill.verificationToken &&
                normalizeRuPhoneDigits(watch("phone") ?? "") === prefill.phone
                  ? `Номер +7 ${formatRuPhone(prefill.phone)} подтверждён. Осталось имя и пароль.`
                  : `Аккаунта с номером +7 ${formatRuPhone(prefill.phone)} ещё нет. ${
                      prefill.password
                        ? "Укажите имя — и он будет создан."
                        : "Укажите имя и придумайте пароль — и он будет создан."
                    }`}
              </AppText>
            </View>
          ) : null}

          <RegisterFormFields
            control={control}
            errors={errors}
            isBusy={isBusy}
            acceptedTerms={acceptedTerms}
            onToggleTerms={() => setAcceptedTerms((v) => !v)}
            serverError={serverError}
            autoFocusName={!!prefill}
          />
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
            <AppText className="text-ios-callout text-body">Уже есть аккаунт? </AppText>
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
              <AppText weight="semibold" className="text-ios-callout text-accent">
                Войти
              </AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      {register.sheet}
    </KeyboardAvoidingView>
  );
}
