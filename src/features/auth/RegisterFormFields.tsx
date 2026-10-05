/**
 * Поля регистрации: имя, фамилия, телефон (+7), пароль, согласие с условиями,
 * ошибка сервера. Общие для экрана «Создать аккаунт» (app/(auth)/register.tsx)
 * и шага «Ваш аккаунт» в создании задания гостем
 * (app/(details)/orders/new/account.tsx, владелец 2026-10-03: «регистрация в
 * рамках создания задания, а не отдельно»). Форма (react-hook-form) и
 * отправка — у вызывающего экрана.
 */

import { useRouter } from "expo-router";
import { Check, Eye, EyeSlash } from "phosphor-react-native";
import { useState } from "react";
import { type Control, Controller, type FieldErrors } from "react-hook-form";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Input } from "@/components/ui";
import { normalizeRuPhoneDigits, type RegisterFormValues } from "@/features/auth/validation";
import { useThemeColors } from "@/lib/use-theme-color";

/** Показываем 10 цифр как `XXX XXX-XX-XX`. В форме при этом хранятся ровно
 *  цифры — маска только для чтения глазами. */
export function formatRuPhone(digits: string): string {
  const d = digits.slice(0, 10);
  let result = "";
  if (d.length > 0) result += d.slice(0, 3);
  if (d.length > 3) result += ` ${d.slice(3, 6)}`;
  if (d.length > 6) result += `-${d.slice(6, 8)}`;
  if (d.length > 8) result += `-${d.slice(8, 10)}`;
  return result;
}

export function RegisterFormFields({
  control,
  errors,
  isBusy,
  acceptedTerms,
  onToggleTerms,
  serverError,
  autoFocusName = false,
}: {
  control: Control<RegisterFormValues>;
  errors: FieldErrors<RegisterFormValues>;
  isBusy: boolean;
  acceptedTerms: boolean;
  onToggleTerms: () => void;
  serverError: string | null;
  autoFocusName?: boolean;
}) {
  const router = useRouter();
  const tc = useThemeColors(["mute", "on-accent"]);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <>
      <View className="mt-8 flex-row gap-3">
        <View className="flex-1">
          <Controller
            control={control}
            name="firstName"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                size="lg"
                label="Имя"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="Руслан"
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                autoFocus={autoFocusName}
                editable={!isBusy}
                error={errors.firstName?.message}
              />
            )}
          />
        </View>
        <View className="flex-1">
          <Controller
            control={control}
            name="lastName"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                size="lg"
                label="Фамилия"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="Необязательно"
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
                editable={!isBusy}
                error={errors.lastName?.message}
              />
            )}
          />
        </View>
      </View>

      {/* Номер — единственный формат: +7 и десять цифр. Код страны не
        выбирается и не вводится, поэтому «8» и «7» в начале больше не
        создают два разных аккаунта (DECISION владельца 2026-09-03). */}
      <View className="mt-5">
        <AppText weight="semibold" className="mb-2 text-ios-callout text-ink">
          Номер телефона
        </AppText>
        <View className="flex-row items-start gap-2">
          <View
            className="flex-row items-center rounded-xl border-hairline-strong bg-canvas-soft px-4"
            style={{ minHeight: 54, borderWidth: 1.5 }}
          >
            <AppText weight="semibold" className="text-ios-body text-ink">
              +7
            </AppText>
          </View>
          <View className="flex-1">
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  size="lg"
                  value={formatRuPhone(value)}
                  onBlur={onBlur}
                  // Нормализуем на каждый ввод: вставка «8 928…» или
                  // «+7 928…» из буфера превращается в те же 10 цифр.
                  onChangeText={(raw) => onChange(normalizeRuPhoneDigits(raw))}
                  placeholder="928 123-45-67"
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

      {/* «Минимум 8 символов» — лейбл ПОЛЯ (не subtitle под H1), §G не
        нарушается. */}
      <View className="mt-5">
        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              size="lg"
              label="Пароль · минимум 8 символов"
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

      {/* Согласие с условиями — отмечено по умолчанию, без него кнопка неактивна. */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acceptedTerms }}
        accessibilityLabel="Я согласен с условиями использования и политикой конфиденциальности"
        onPress={onToggleTerms}
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
          <AppText className="text-ios-callout text-body">Я согласен с </AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Условия использования"
            disabled={isBusy}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            onPress={() => router.push("/legal/terms" as never)}
          >
            <AppText weight="semibold" className="text-ios-callout text-accent">
              Условиями использования
            </AppText>
          </Pressable>
          <AppText className="text-ios-callout text-body"> и </AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Политика конфиденциальности"
            disabled={isBusy}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            onPress={() => router.push("/legal/privacy" as never)}
          >
            <AppText weight="semibold" className="text-ios-callout text-accent">
              Политикой конфиденциальности
            </AppText>
          </Pressable>
          <AppText className="text-ios-callout text-body">.</AppText>
        </View>
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
    </>
  );
}
