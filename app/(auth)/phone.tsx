import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { CaretLeft, Check } from "phosphor-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { useVerifyOtp } from "@/features/auth/use-auth-mutations";
import {
  digitsOnly,
  type PhoneFormValues,
  phoneFormSchema,
} from "@/features/auth/validation";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

/** Форматирование цифр в маску для конкретной страны.
 *  Для +7 (РФ/КЗ) — стандартная маска `XXX XXX-XX-XX`.
 *  Для остальных — группы по 3 цифры без разделителей. */
function formatPhoneByCountry(digits: string, country: Country): string {
  const d = digits.slice(0, country.digitsLength);
  if (country.dial === "7") {
    // RU/KZ: XXX XXX-XX-XX
    let result = "";
    if (d.length > 0) result += d.slice(0, 3);
    if (d.length > 3) result += ` ${d.slice(3, 6)}`;
    if (d.length > 6) result += `-${d.slice(6, 8)}`;
    if (d.length > 8) result += `-${d.slice(8, 10)}`;
    return result;
  }
  // Generic: группы по 3
  return d.match(/.{1,3}/g)?.join(" ") ?? d;
}

export default function PhoneScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Sprint 1 dev-mode (фидбэк user 2026-05-16): экран /verify обходится
  // полностью, sign-in вызывается напрямую из этого экрана. Real OTP вернём
  // в Sprint 2 — тогда восстановим useSendOtp + переход на /verify.
  const verifyOtp = useVerifyOtp();
  const [serverError, setServerError] = useState<string | null>(null);
  // По умолчанию ОТМЕЧЕНО (фидбэк владельца 2026-05-29 — удобство входа).
  // ⚠️ ВНИМАНИЕ перед публикацией в App Store / Google Play: проверка Apple
  // (guideline 5.1.1) и 152-ФЗ требуют ACTIVE opt-in — пользователь должен сам
  // поставить галочку, предотмеченное согласие могут отклонить. Перед сабмитом
  // вернуть `useState(false)`. Сейчас true — осознанное решение владельца для
  // тестового/демо-этапа.
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  // confirming = «sign-in succeeded, показываю короткий feedback и тут же
  // редиректну». Раньше после submit был мгновенный redirect, у user'а
  // создавалось впечатление «ничего не произошло» (фидбэк 2026-05-20).
  const [confirming, setConfirming] = useState(false);
  const [confirmingPhone, setConfirmingPhone] = useState("");
  // Sprint 2026-05-20: селектор страны (дефолт +7 Россия). Полный номер
  // собирается на submit: country.dial + digits.
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  // useThemeColors batch — раньше тут было 2 hook'а + inline hex для иконки чека.
  const tc = useThemeColors(["muted-soft", "ink", "on-primary"]);
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
    // Sprint 2026-05-20: собираем полный E.164 номер с кодом выбранной страны.
    // Поле values.phone теперь содержит только digits (без +N префикса).
    const digits = digitsOnly(values.phone);
    const phone = `+${country.dial}${digits}`;
    setServerError(null);
    try {
      await verifyOtp.mutateAsync({ phone, code: "" });
      // Sprint 1: OTP-экран обойдён, чтобы юзер ВИДЕЛ что вход реально произошёл —
      // показываем 700мс overlay «Подтверждаю ваш номер …». Без этого был effect
      // «нажал — ничего не случилось» (фидбэк user 2026-05-20).
      setConfirmingPhone(phone);
      setConfirming(true);
      await new Promise((r) => setTimeout(r, 700));
      // Не делаем явный router.replace — AuthGate (_layout.tsx:121-128) сам
      // решит куда отправить: если onboarding_completed_at IS NULL → на
      // /(onboarding)/role; иначе на /(tabs). Раньше тут была своя ветка
      // через returnUrl-store, она вызывала flash role-экрана у existing
      // users (returnUrl от прошлой сессии оставался в store + AuthGate
      // двойной редирект). Возврат на target страницу для CTA «Стать
      // мастером» делается на финальном шаге master-photo.tsx через
      // consumeReturnUrl() — уже без участия phone.tsx.
      router.replace("/(tabs)" as never);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось войти");
    }
  });

  const isBusy = verifyOtp.isPending || confirming;

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
          {/* P0 fix 2026-05-20: back-кнопка disabled во время confirming overlay,
              иначе юзер мог тапнуть back во время 700мс окна и попасть в trap. */}
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
            {serverError && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {serverError}
              </AppText>
            )}
          </View>
        </View>

        <View>
          {/* Active opt-in. Submit disabled пока пользователь не отметит чекбокс
              и не введёт корректный номер. Тапы на «Условиями использования» и
              «Политикой конфиденциальности» открывают legal-экраны (доступны
              анонимам через AuthGate allowlist `inLegal`). */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            accessibilityLabel="Я согласен с условиями использования и политикой конфиденциальности"
            onPress={() => setAcceptedTerms((v) => !v)}
            className="mb-4 flex-row items-start gap-3 active:opacity-70"
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

          <Pressable
            accessibilityRole="button"
            disabled={!isValid || !acceptedTerms || isBusy}
            onPress={onSubmit}
            className={`h-12 items-center justify-center rounded-md ${
              isValid && acceptedTerms && !isBusy
                ? "bg-primary active:opacity-80"
                : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Входим..." : "Войти"}
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Feedback overlay — показывается 700мс после успешного sign-in.
          Без этого юзер не видел что вход реально произошёл (фидбэк
          2026-05-20: «нажал войти — меня тут же закидывает на главную,
          даже не попросили ввести номер»). Sprint 2: заменим на реальный
          /verify с 6-значным OTP. */}
      {confirming ? (
        <View
          accessibilityRole="alert"
          className="absolute inset-0 items-center justify-center bg-canvas/95"
        >
          <ActivityIndicator size="large" />
          <AppText weight="semibold" className="mt-4 text-title-md text-ink">
            Подтверждаю ваш номер
          </AppText>
          <AppText weight="medium" className="mt-1 text-body-md text-muted">
            {confirmingPhone}
          </AppText>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
