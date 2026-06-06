/**
 * ChangePhoneSheet — смена номера телефона из «Редактировать профиль».
 *
 * Один шаг (с 2026-06-06): поле «Новый номер» + кнопка «Сохранить» → прямой
 * UPDATE users_private.phone. БЕЗ SMS-кода.
 *
 * Почему убран SMS-шаг: вход по SMS отменён 2026-06-05 (был платным),
 * вместо него — пароль. Старый двухшаговый flow дёргал `useSendOtp`, который
 * для реального номера вызывал supabase.auth.signInWithOtp → мёртвый SMS-hook →
 * ошибка «Invalid payload sent to hook». Теперь смена номера — это просто
 * запись нового номера в профиль под текущей сессией, код не нужен.
 *
 * Проверки перед сохранением:
 *   - ровно 10 цифр (формат +7XXXXXXXXXX);
 *   - не demo-номер (+79000…) — зарезервированы за тест-аккаунтами;
 *   - не равен текущему номеру;
 *   - не занят другим аккаунтом — ловим UNIQUE-ошибку из useUpdateMyPhone
 *     и показываем «Этот номер уже зарегистрирован на другом аккаунте».
 *
 * Номер нормализуется через normalizePhone перед сохранением (каноническая
 * форма +7XXXXXXXXXX, как при регистрации).
 */

import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { digitsOnly, formatPhoneMask, normalizePhone } from "@/features/auth/validation";
import { useUpdateMyPhone } from "@/features/profile/use-user-private";
import { useThemeColors } from "@/lib/use-theme-color";

export interface ChangePhoneSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
  /** Текущий номер — чтобы запретить смену «на тот же». */
  currentPhone: string | null;
}

export function ChangePhoneSheet({
  open,
  onClose,
  userId,
  currentPhone,
}: ChangePhoneSheetProps) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updatePhone = useUpdateMyPhone(userId);
  const tc = useThemeColors(["muted-soft", "on-primary"]);

  const phoneDigits = digitsOnly(phone).replace(/^[78]/, "");
  const phoneValid = phoneDigits.length === 10;
  const normalized = normalizePhone(phone);
  // Запрет на «занятие» demo-телефонов (+79000… — фикс-тест-аккаунты).
  const isDemoPhone = normalized.startsWith("+79000");
  // Запрет на смену «на тот же номер».
  const isSameAsCurrent = currentPhone === normalized;

  const isBusy = updatePhone.isPending;
  const canSave = phoneValid && !isDemoPhone && !isSameAsCurrent && !isBusy;

  const reset = () => {
    setPhone("");
    setError(null);
  };

  const handleClose = () => {
    if (isBusy) return;
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!phoneValid || isBusy) return;
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
      await updatePhone.mutateAsync({ phone: normalized });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить номер");
    }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="Сменить номер">
      <View className="mt-2 gap-3 px-5">
        <View>
          <AppText weight="medium" className="mb-1.5 text-caption text-mute">
            Новый номер
          </AppText>
          <TextInput
            value={phone}
            onChangeText={(v) => {
              setError(null);
              setPhone(formatPhoneMask(v));
            }}
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
        ) : (
          <AppText className="text-caption text-mute">
            По этому номеру вы входите в приложение.
          </AppText>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Сохранить номер"
          disabled={!canSave}
          onPress={handleSave}
          className={`h-12 items-center justify-center rounded-pill ${
            canSave ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={tc["on-primary"]} />
          ) : (
            <AppText
              weight="semibold"
              className={`text-button ${canSave ? "text-on-primary" : "text-muted"}`}
            >
              Сохранить
            </AppText>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}
