/**
 * JitSignupSheet — bottom-sheet с быстрой регистрацией гостя при публикации заказа.
 *
 * Зачем. Анон заполняет заказ (/orders/new), жмёт «Опубликовать» — открывается
 * этот sheet. Гость вводит имя + номер → создаётся аккаунт → callback
 * `onSignedUp(userId)`, родитель публикует заказ под уже залогиненной сессией.
 * Форма заказа не теряется (лежит в useOrderDraftStore, sheet — modal поверх).
 *
 * Модель входа (2026-06-05): SMS убран. Раньше тут был фиктивный шаг «код из SMS»
 * (любые 6 цифр), который всё равно лишь создавал анонимную сессию. Теперь шаг с
 * кодом убран совсем — один шаг: имя + телефон → анонимный аккаунт (Supabase
 * signInAnonymously) с записанным phone в users_private. Без SMS, без пароля —
 * самый низкий порог для публикации заказа. Если гость захочет вход с других
 * устройств, он позже зарегистрируется с паролем (экран /register).
 *
 * После создания сессии пишем first_name + onboarding_completed_at=now()
 * (JIT-flow пропускает онбординг — заказ уже заполнен), затем onSignedUp.
 */

import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { signInAnonymouslyWithPhone } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";
import { digitsOnly, formatPhoneMask, normalizePhone } from "./validation";

export interface JitSignupSheetProps {
  open: boolean;
  onClose: () => void;
  /** Вызывается после успешной регистрации/входа с новым userId. */
  onSignedUp: (userId: string) => void | Promise<void>;
}

export function JitSignupSheet({ open, onClose, onSignedUp }: JitSignupSheetProps) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tc = useThemeColors(["muted-soft", "on-primary"]);

  const phoneDigits = digitsOnly(phone).replace(/^[78]/, "");
  const phoneValid = phoneDigits.length === 10;
  const nameValid = name.trim().length >= 2;
  const canSubmit = phoneValid && nameValid && !busy;

  const reset = () => {
    setPhone("");
    setName("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      // 1. Создаём анонимную сессию + сохраняем телефон в users_private.
      const res = await signInAnonymouslyWithPhone(normalizePhone(phone));
      if (!res.ok) {
        setError(res.error);
        return;
      }

      // 2. Берём userId созданной сессии (кэшируется синхронно после входа).
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) {
        setError("Сессия не создана. Попробуйте ещё раз.");
        return;
      }

      // 3. Имя + пропускаем онбординг (заказ уже заполнен).
      const { error: updErr } = await supabase
        .from("users")
        .update({
          first_name: name.trim(),
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", uid);
      if (updErr) {
        // Не фатально — имя можно дозаполнить в профиле.
        console.warn("[jit-signup] users update failed:", updErr.message);
      }

      // 4. Колбэк родителю — он публикует заказ от uid.
      await onSignedUp(uid);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось продолжить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="Последний шаг — представьтесь">
      <View className="mt-2 gap-3 px-5">
        <View>
          <AppText weight="medium" className="mb-1.5 text-caption text-mute">
            Ваше имя
          </AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Алина"
            placeholderTextColor={tc["muted-soft"]}
            autoFocus
            autoCapitalize="words"
            editable={!busy}
            maxLength={60}
            className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
          />
        </View>
        <View>
          <AppText weight="medium" className="mb-1.5 text-caption text-mute">
            Номер телефона
          </AppText>
          <TextInput
            value={phone}
            onChangeText={(v) => setPhone(formatPhoneMask(v))}
            placeholder="+7 ___ ___-__-__"
            placeholderTextColor={tc["muted-soft"]}
            keyboardType="phone-pad"
            inputMode="tel"
            editable={!busy}
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
          disabled={!canSubmit}
          onPress={handleSubmit}
          className={`h-12 items-center justify-center rounded-pill ${
            canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={tc["on-primary"]} />
          ) : (
            <AppText
              weight="semibold"
              className={`text-button ${canSubmit ? "text-on-primary" : "text-muted"}`}
            >
              Опубликовать заказ
            </AppText>
          )}
        </Pressable>

        <AppText className="mt-1 text-center text-caption text-mute">
          Ваш номер скрыт от мастеров. Нажимая «Опубликовать заказ», вы соглашаетесь с правилами сервиса.
        </AppText>
      </View>
    </BottomSheet>
  );
}
