/**
 * JitSignupSheet — bottom-sheet с быстрой регистрацией по телефону.
 *
 * Зачем. Анон создаёт заказ (формa на /orders/new), нажимает «Опубликовать»
 * — открывается этот sheet с двумя шагами: phone → SMS. После success'а
 * вызывает callback `onSignedUp(userId)`, и родитель публикует заказ
 * под уже залогиненной сессией. Форма заказа НЕ теряется потому что
 * лежит в `useOrderDraftStore` (Zustand), а sheet — modal над тем же
 * экраном (нет навигации прочь).
 *
 * Референсы (Profi.ru / YouDo / TaskRabbit / Airbnb): на финальном шаге
 * чек-аута/публикации появляется компактная форма «Войдите чтобы продолжить»
 * прямо поверх заказа. Юзер не уходит, не теряет введённое.
 *
 * Sprint 1 — реальный SMS не отправляем (см. use-auth-mutations.ts).
 * `sendOtp` — 800ms задержка; `verifyOtp` — игнорирует код (любые 6 цифр
 * проходят) и просто создаёт anonymous-сессию с записанным phone в
 * users_private. Sprint 2 заменит на supabase.auth.signInWithOtp/verifyOtp.
 *
 * Sprint 1 caveat: использует анонимный flow Supabase Auth — пользователь
 * получает рандомный UUID, в users_private сохраняется phone. Имя
 * вводится здесь же и записывается в users.first_name. После signup
 * AuthGate в _layout.tsx направит в (onboarding) если onboarding_completed_at IS NULL,
 * но для «быстрого старта» из JIT-flow мы хотим **остаться** на /orders/new
 * чтобы родитель сразу опубликовал. Решение: после signup мы записываем
 * onboarding_completed_at=now() сразу — пропускаем onboarding wizard для
 * клиентов, кто создаёт заказ JIT (мастеру онбординг всё равно нужен, но
 * это другой flow — он логинится через /profile или CTA «Стать мастером»).
 */

import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";
import { useSendOtp, useVerifyOtp } from "./use-auth-mutations";
import { formatPhoneMask, normalizePhone, digitsOnly } from "./validation";

export interface JitSignupSheetProps {
  open: boolean;
  onClose: () => void;
  /** Вызывается после успешной регистрации/входа с новым userId. */
  onSignedUp: (userId: string) => void | Promise<void>;
}

type Step = "phone-name" | "code";

export function JitSignupSheet({ open, onClose, onSignedUp }: JitSignupSheetProps) {
  const [step, setStep] = useState<Step>("phone-name");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
  const tc = useThemeColors(["ink", "muted-soft", "on-primary", "mute"]);

  const phoneDigits = digitsOnly(phone).replace(/^[78]/, "");
  const phoneValid = phoneDigits.length === 10;
  const nameValid = name.trim().length >= 2;
  const codeValid = /^\d{6}$/.test(code);

  const reset = () => {
    setStep("phone-name");
    setPhone("");
    setName("");
    setCode("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSendOtp = async () => {
    if (!phoneValid || !nameValid || sendOtp.isPending) return;
    setError(null);
    try {
      await sendOtp.mutateAsync({ phone: normalizePhone(phone) });
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить код");
    }
  };

  const handleVerify = async () => {
    if (!codeValid || verifyOtp.isPending) return;
    setError(null);
    try {
      // 1. Создаём anon-сессию + сохраняем phone (Sprint 1 stub).
      await verifyOtp.mutateAsync({ phone: normalizePhone(phone), code });

      // 2. Достаём созданный userId. supabase.auth кэширует сессию синхронно после verify.
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) {
        setError("Сессия не создана. Попробуйте ещё раз.");
        return;
      }

      // 3. Записываем имя в users + помечаем onboarding completed (JIT-flow
      //    пропускает онбординг — пользователь уже заполнил заказ).
      const trimmedName = name.trim();
      const updateRes = await supabase
        .from("users")
        .update({
          first_name: trimmedName,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", uid);
      if (updateRes.error) {
        // Не фатально для публикации заказа — имя можно дозаполнить в профиле.
        console.warn("[jit-signup] users update failed:", updateRes.error.message);
      }

      // 4. Колбэк родителю — он опубликует заказ от uid.
      await onSignedUp(uid);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти");
    }
  };

  const isBusy = sendOtp.isPending || verifyOtp.isPending;

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={step === "phone-name" ? "Последний шаг — войдите" : "Введите код из SMS"}
    >
      <View className="gap-3 mt-2">
        {step === "phone-name" ? (
          <>
            <View>
              <AppText weight="medium" className="text-caption text-mute mb-1.5">
                Ваше имя
              </AppText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Алина"
                placeholderTextColor={tc["muted-soft"]}
                autoFocus
                autoCapitalize="words"
                editable={!isBusy}
                maxLength={60}
                className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
              />
            </View>
            <View>
              <AppText weight="medium" className="text-caption text-mute mb-1.5">
                Номер телефона
              </AppText>
              <TextInput
                value={phone}
                onChangeText={(v) => setPhone(formatPhoneMask(v))}
                placeholder="+7 ___ ___-__-__"
                placeholderTextColor={tc["muted-soft"]}
                keyboardType="phone-pad"
                inputMode="tel"
                editable={!isBusy}
                className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
              />
            </View>

            {error && (
              <AppText weight="medium" className="text-caption text-error">
                {error}
              </AppText>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={!phoneValid || !nameValid || isBusy}
              onPress={handleSendOtp}
              className={`h-12 items-center justify-center rounded-pill ${
                phoneValid && nameValid && !isBusy ? "bg-ink active:opacity-80" : "bg-canvas-soft-2"
              }`}
            >
              {sendOtp.isPending ? (
                <ActivityIndicator size="small" color={tc["on-primary"]} />
              ) : (
                <AppText
                  weight="semibold"
                  className="text-button"
                  style={{
                    color: phoneValid && nameValid && !isBusy ? tc["on-primary"] : tc.mute,
                  }}
                >
                  Получить код
                </AppText>
              )}
            </Pressable>

            <AppText className="text-caption text-mute text-center mt-1">
              Нажимая «Получить код», вы соглашаетесь с правилами сервиса.
            </AppText>
          </>
        ) : (
          <>
            <View>
              <AppText weight="medium" className="text-caption text-mute mb-1.5">
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

            {error && (
              <AppText weight="medium" className="text-caption text-error">
                {error}
              </AppText>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={!codeValid || isBusy}
              onPress={handleVerify}
              className={`h-12 items-center justify-center rounded-pill ${
                codeValid && !isBusy ? "bg-ink active:opacity-80" : "bg-canvas-soft-2"
              }`}
            >
              {verifyOtp.isPending ? (
                <ActivityIndicator size="small" color={tc["on-primary"]} />
              ) : (
                <AppText
                  weight="semibold"
                  className="text-button"
                  style={{ color: codeValid && !isBusy ? tc["on-primary"] : tc.mute }}
                >
                  Подтвердить и опубликовать
                </AppText>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setStep("phone-name");
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
