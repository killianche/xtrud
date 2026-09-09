/**
 * /profile/change-phone — смена номера телефона из «Редактировать профиль».
 *
 * Раньше `ChangePhoneSheet` жил как `BottomSheet` внутри `edit-client.tsx`.
 * Теперь — отдельный route с нативной iOS `modal`-модальностью
 * (`docs/IOS_FOUNDATION.md` §2.4): самостоятельная отменяемая целиком задача
 * с вводом номера → `presentation: "modal"`.
 *
 * `userId` берётся из своей сессии (`useAuthSession`), `currentPhone` — из
 * своего `useUserPrivate(userId)` (тот же react-query key, что у
 * `edit-client.tsx` — в обычном флоу кеш-хит без сети). Мутация
 * (`useUpdateMyPhone`) инвалидирует свой query на success, поэтому
 * `edit-client.tsx` сам подхватит новый номер при следующем фокусе — round-trip
 * через store не нужен (та же логика, что у `create-case` / `delete-account`).
 *
 * Один шаг (с 2026-06-06): поле «Новый номер» + кнопка «Сохранить» → прямой
 * UPDATE users_private.phone. БЕЗ SMS-кода (SMS-вход отменён 2026-06-05).
 *
 * Проверки перед сохранением:
 *   - ровно 10 цифр (формат +7XXXXXXXXXX);
 *   - не demo-номер (+79000…) — зарезервированы за тест-аккаунтами;
 *   - не равен текущему номеру;
 *   - не занят другим аккаунтом — ловим UNIQUE-ошибку из useUpdateMyPhone.
 *
 * Приватный route (владелец-only) — не в `PUBLIC_DETAIL_ROUTES`:
 * `profile/edit-client` сам приватный.
 *
 * `KeyboardAvoidingView behavior="padding"`: требует проверки на реальном
 * устройстве — симулятора/устройства в этой среде нет.
 */

import { Stack, useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { useState } from "react";
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
import { useAuthSession } from "@/features/auth/use-auth-session";
import { digitsOnly, formatPhoneMask, normalizePhone } from "@/features/auth/validation";
import { useUpdateMyPhone, useUserPrivate } from "@/features/profile/use-user-private";
import { useMyVerification } from "@/features/specialist/use-verification";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ChangePhoneScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  // Подтверждение личности снимается при смене номера (0182): документ
  // подтверждал связь «этот человек — этот аккаунт», а с новым номером
  // аккаунтом может пользоваться кто-то другой. Запретить смену нельзя —
  // номера меняют по‑настоящему, — поэтому предупреждаем заранее.
  const verification = useMyVerification(userId);
  const willLoseBadge = !!verification.data?.verified_at && verification.data.revoked_at === null;
  const { data: userPrivate } = useUserPrivate(userId);
  const currentPhone = userPrivate?.phone ?? null;

  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updatePhone = useUpdateMyPhone(userId);
  const tc = useThemeColors(["muted-soft", "on-primary", "mute"]);

  const phoneDigits = digitsOnly(phone).replace(/^[78]/, "");
  const phoneValid = phoneDigits.length === 10;
  const normalized = normalizePhone(phone);
  // Запрет на «занятие» demo-телефонов (+79000… — фикс-тест-аккаунты).
  const isDemoPhone = normalized.startsWith("+79000");
  // Запрет на смену «на тот же номер».
  const isSameAsCurrent = currentPhone === normalized;

  const isBusy = updatePhone.isPending;
  const canSave = phoneValid && !isDemoPhone && !isSameAsCurrent && !isBusy;

  const close = () => {
    if (isBusy) return;
    router.back();
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
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить номер");
    }
  };

  return (
    <>
      <Stack.Screen options={{ presentation: "modal", gestureEnabled: !isBusy }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-canvas"
        // Отступ от чёлки обязателен на каждом экране (DECISION владельца
        // 2026-09-06). Внутри системной модалки inset маленький, на полном
        // экране — высота статус-бара; в обоих случаях заголовок не под часами.
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center gap-3 px-5 py-3">
          <AppText weight="bold" className="flex-1 text-display-sm tracking-tight text-ink">
            Сменить номер
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            disabled={isBusy}
            onPress={close}
            hitSlop={10}
            className={`h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft ${
              isBusy ? "opacity-40" : ""
            }`}
          >
            <X size={22} weight="bold" color={tc.mute} />
          </Pressable>
        </View>

        <View className="mt-2 gap-3 px-5 pb-6">
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
              className="min-h-12 rounded-md border border-hairline bg-canvas px-3 text-field-md text-ink"
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

          {willLoseBadge ? (
            <AppText weight="medium" className="text-caption text-warning">
              После смены номера значок «подтверждён паспортом» снимется: документ подтверждал
              именно этот аккаунт. Вернуть его можно, отправив фото паспорта заново.
            </AppText>
          ) : null}

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
      </KeyboardAvoidingView>
    </>
  );
}
