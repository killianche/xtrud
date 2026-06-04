import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { CaretLeft, Check } from "phosphor-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
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
import { useSendOtp } from "@/features/auth/use-auth-mutations";
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
  // Реальный SMS-вход (2026-06-04): отправляем код (supabase signInWithOtp →
  // Send SMS Hook → SMS.ru) и переходим на /verify для ввода. Demo-номера —
  // sendOtp no-op, вход по email/паролю на verify.
  const sendOtp = useSendOtp();
  const [serverError, setServerError] = useState<string | null>(null);
  // По умолчанию ОТМЕЧЕНО (фидбэк владельца 2026-05-29 — удобство входа).
  // ⚠️ ВНИМАНИЕ перед публикацией в App Store / Google Play: проверка Apple
  // (guideline 5.1.1) и 152-ФЗ требуют ACTIVE opt-in — пользователь должен сам
  // поставить галочку, предотмеченное согласие могут отклонить. Перед сабмитом
  // вернуть `useState(false)`. Сейчас true — осознанное решение владельца для
  // тестового/демо-этапа.
  const [acceptedTerms, setAcceptedTerms] = useState(true);
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
    // Собираем полный E.164 номер с кодом выбранной страны.
    const digits = digitsOnly(values.phone);
    const phone = `+${country.dial}${digits}`;
    setServerError(null);
    try {
      // Отправляем код (реальный SMS или demo no-op) и переходим на экран
      // ввода кода. Сам вход произойдёт там, после verifyOtp.
      await sendOtp.mutateAsync({ phone });
      router.push(`/(auth)/verify?phone=${encodeURIComponent(phone)}` as never);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось отправить код");
    }
  });

  const isBusy = sendOtp.isPending;

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
              {isBusy ? "Отправляем код..." : "Получить код"}
            </AppText>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
