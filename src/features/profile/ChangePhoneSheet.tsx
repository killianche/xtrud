/**
 * ChangePhoneSheet — смена номера телефона из «Редактировать профиль».
 *
 * Архитектурно симметричен `JitSignupSheet` (тот же двухшаговый flow:
 * phone → SMS-код), но вместо создания anonymous-сессии этот sheet
 * UPDATE'ает phone в существующем `users_private` под текущей сессией.
 *
 * Sprint 1 caveat: SMS-провайдер не подключён. `useSendOtp` — 800ms
 * задержка, OTP-код не проверяется (любые 6 цифр). UI всё равно
 * запрашивает код для UX-симметрии с регистрацией — пользователь
 * видит единый паттерн. В Sprint 2 заменим на
 *   supabase.auth.updateUser({ phone })   // шлёт SMS на новый номер
 *   supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })
 *
 * Запрет смены на demo-phone (`+79000…`): эти номера зарезервированы
 * за фикс-тестовыми аккаунтами Алина/Магомед/etc. (см. lib/auth.ts).
 * Юзер обычной анон-сессии не должен «занять» демо-слот — иначе при
 * следующем входе по +79000 он перейдёт на демо-сессию.
 */

import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { useSendOtp } from "@/features/auth/use-auth-mutations";
import { digitsOnly, formatPhoneMask, normalizePhone } from "@/features/auth/validation";
import { useUpdateMyPhone } from "@/features/profile/use-user-private";
import { useThemeColors } from "@/lib/use-theme-color";

export interface ChangePhoneSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
  /** Текущий номер — показываем как «текущий: …» для контекста. */
  currentPhone: string | null;
}

type Step = "new-phone" | "code";

export function ChangePhoneSheet({
  open,
  onClose,
  userId,
  currentPhone,
}: ChangePhoneSheetProps) {
  const [step, setStep] = useState<Step>("new-phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sendOtp = useSendOtp();
  const updatePhone = useUpdateMyPhone(userId);
  const tc = useThemeColors(["mute", "muted-soft", "on-primary"]);

  const phoneDigits = digitsOnly(phone).replace(/^[78]/, "");
  const phoneValid = phoneDigits.length === 10;
  const codeValid = /^\d{6}$/.test(code);
  const normalized = normalizePhone(phone);
  // Запрет на «занятие» demo-телефонов.
  const isDemoPhone = normalized.startsWith("+79000");
  // Запрет на смену «на тот же номер».
  const isSameAsCurrent = currentPhone === normalized;

  const reset = () => {
    setStep("new-phone");
    setPhone("");
    setCode("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSendOtp = async () => {
    if (!phoneValid || sendOtp.isPending) return;
    if (isDemoPhone) {
      setError("Номера +79000… зарезервированы за тестовыми аккаунтами.");
      return;
    }
    if (isSameAsCurrent) {
      setError("Это ваш текущий номер.");
      return;
    }
    setError(null);
    try {
      await sendOtp.mutateAsync({ phone: normalized });
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить код");
    }
  };

  const handleVerify = async () => {
    if (!codeValid || updatePhone.isPending) return;
    setError(null);
    try {
      // Sprint 1: код игнорируется (любые 6 цифр валидны). Просто UPDATE phone.
      await updatePhone.mutateAsync({ phone: normalized });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить номер");
    }
  };

  const isBusy = sendOtp.isPending || updatePhone.isPending;

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={step === "new-phone" ? "Сменить номер" : "Введите код из SMS"}
    >
      <View className="mt-2 gap-3 px-5">
        {step === "new-phone" ? (
          <>
            <View>
              <AppText weight="medium" className="mb-1.5 text-caption text-mute">
                Новый номер
              </AppText>
              <TextInput
                value={phone}
                onChangeText={(v) => setPhone(formatPhoneMask(v))}
                placeholder="+7 ___ ___-__-__"
                placeholderTextColor={tc["muted-soft"]}
                keyboardType="phone-pad"
                inputMode="tel"
                autoFocus
                editable={!isBusy}
                className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
              />
            </View>

            {error ? (
              <AppText weight="medium" className="text-caption text-error">
                {error}
              </AppText>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!phoneValid || isBusy}
              onPress={handleSendOtp}
              className={`h-12 items-center justify-center rounded-pill ${
                phoneValid && !isBusy ? "bg-ink active:opacity-80" : "bg-canvas-soft-2"
              }`}
            >
              {sendOtp.isPending ? (
                <ActivityIndicator size="small" color={tc["on-primary"]} />
              ) : (
                <AppText
                  weight="semibold"
                  className="text-button"
                  style={{
                    color: phoneValid && !isBusy ? tc["on-primary"] : tc.mute,
                  }}
                >
                  Получить код
                </AppText>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <View>
              <AppText weight="medium" className="mb-1.5 text-caption text-mute">
                Код из SMS
              </AppText>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={tc["muted-soft"]}
                keyboardType="number-pad"
                inputMode="numeric"
                autoFocus
                editable={!isBusy}
                maxLength={6}
                className="h-14 rounded-md border border-hairline bg-canvas px-3 text-title-md text-ink"
                style={{ letterSpacing: 4, textAlign: "center" }}
              />
            </View>

            {error ? (
              <AppText weight="medium" className="text-caption text-error">
                {error}
              </AppText>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!codeValid || isBusy}
              onPress={handleVerify}
              className={`h-12 items-center justify-center rounded-pill ${
                codeValid && !isBusy ? "bg-ink active:opacity-80" : "bg-canvas-soft-2"
              }`}
            >
              {updatePhone.isPending ? (
                <ActivityIndicator size="small" color={tc["on-primary"]} />
              ) : (
                <AppText
                  weight="semibold"
                  className="text-button"
                  style={{ color: codeValid && !isBusy ? tc["on-primary"] : tc.mute }}
                >
                  Подтвердить и сохранить
                </AppText>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setStep("new-phone");
                setCode("");
                setError(null);
              }}
              disabled={isBusy}
              hitSlop={8}
              className="h-10 items-center justify-center active:opacity-60"
            >
              <AppText weight="medium" className="text-caption text-mute">
                Изменить номер
              </AppText>
            </Pressable>
          </>
        )}
      </View>
    </BottomSheet>
  );
}
