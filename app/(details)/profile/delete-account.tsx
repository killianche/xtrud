/**
 * /profile/delete-account — двухступенчатое подтверждение удаления аккаунта.
 *
 * 1) Объяснение последствий + кнопка «Я понимаю».
 * 2) Поле ввода слова «УДАЛИТЬ» + кнопка submit.
 * Сделано как 2-step внутри одного экрана (не два отдельных alert'а), чтобы
 * пользователь видел список последствий в момент подтверждения.
 *
 * Раньше `DeleteAccountSheet` жил как `BottomSheet` внутри
 * `profile/settings.tsx`. Теперь — отдельный route с нативной iOS
 * `modal`-модальностью (`docs/IOS_FOUNDATION.md` §2.4): самостоятельная
 * отменяемая целиком задача с вводом текста → `presentation: "modal"`.
 *
 * Мутация (`useDeleteMyAccount`) и последующий `signOut()` + редирект на
 * `/(auth)/phone` выполняются прямо здесь — результат некому и незачем
 * возвращать в `settings.tsx` (успешное удаление завершает сессию, экран
 * настроек больше не существует). Store для handshake не нужен, в отличие от
 * пикеров вроде `sort-select`.
 *
 * Приватный route (владелец-only) — не в `PUBLIC_DETAIL_ROUTES`:
 * `profile/settings` сам приватный, анонимный/чужой deep link уводит на табы.
 * `isMaster` передан параметром (в `settings.tsx` уже известен из
 * `useUserRecord`) — сохраняет исходное поведение 1-в-1: мастер-специфичные
 * последствия (портфолио/верификация/активные заказы) показываются только
 * мастерам. Без параметра (deep link) по умолчанию `false` — экран не падает,
 * просто не показывает мастер-специфичные пункты.
 *
 * `KeyboardAvoidingView behavior="padding"`: шаг confirm имеет текстовое
 * поле, нативная `modal`-модальность клавиатуру сама не решает. Требует
 * проверки на реальном устройстве — симулятора/устройства в этой среде нет.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useDeleteMyAccount } from "@/features/auth/use-delete-account";
import { signOut } from "@/lib/auth";
import { describeServerError } from "@/lib/describe-server-error";
import { useThemeColors } from "@/lib/use-theme-color";

function ConsequenceRow({ text }: { text: string }) {
  const tc = useThemeColors(["error"]);
  return (
    <View className="flex-row gap-2 py-1.5">
      <View className="mt-1.5 h-1 w-1 rounded-full" style={{ backgroundColor: tc.error }} />
      <AppText className="flex-1 text-body-sm text-body">{text}</AppText>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ isMaster?: string }>();
  const isMaster = params.isMaster === "true";
  const [step, setStep] = useState<"warn" | "confirm">("warn");
  const [confirmText, setConfirmText] = useState("");
  const deleteAccount = useDeleteMyAccount();
  const tc = useThemeColors(["error", "muted-soft", "mute"]);

  const isBusy = deleteAccount.isPending;
  const REQUIRED = "УДАЛИТЬ";
  const canSubmit = step === "confirm" && confirmText.trim() === REQUIRED && !isBusy;

  const close = () => {
    if (isBusy) return;
    router.back();
  };

  const handleDelete = async () => {
    if (!canSubmit) return;
    try {
      const result = await deleteAccount.mutateAsync();
      if (result.ok || result.reason === "already_deleted") {
        await signOut();
        router.replace("/(auth)/phone" as never);
      }
    } catch {
      // Ошибка покажется через deleteAccount.error ниже
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
            {step === "warn" ? "Удалить аккаунт?" : "Подтвердите удаление"}
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

        <View className="flex-1 px-5 pb-6">
          {step === "warn" ? (
            <View>
              <View className="rounded-lg border border-hairline bg-canvas-soft p-4">
                <ConsequenceRow text="Профиль скроется от других пользователей." />
                <ConsequenceRow text="Имя, телефон, фото и личные данные будут удалены." />
                <ConsequenceRow text="Открытые заявки будут отменены, мастера и клиенты получат уведомления." />
                {isMaster ? (
                  <>
                    <ConsequenceRow text="Категории, прайс-лист, портфолио и данные верификации будут удалены." />
                    <ConsequenceRow text="Активные заказы, где вы выбраны мастером, будут отменены." />
                  </>
                ) : null}
                <ConsequenceRow text="Чаты и отзывы останутся у второй стороны как «Удалённый пользователь»." />
                <ConsequenceRow text="Восстановить аккаунт через этот номер будет невозможно." />
              </View>

              <View className="mt-5 gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStep("confirm")}
                  className="min-h-12 items-center justify-center rounded-md bg-error active:opacity-80"
                >
                  <AppText weight="semibold" className="text-button text-on-primary">
                    Я понимаю, продолжить
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={close}
                  className="min-h-12 items-center justify-center rounded-md border border-hairline active:opacity-70"
                >
                  <AppText weight="semibold" className="text-button text-ink">
                    Отмена
                  </AppText>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={REQUIRED}
                placeholderTextColor={tc["muted-soft"]}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
                editable={!isBusy}
                autoFocus
                className="min-h-12 rounded-md border border-hairline bg-canvas px-3 py-3 text-field-md text-ink"
                accessibilityLabel="Поле подтверждения удаления"
              />

              {deleteAccount.error ? (
                <AppText weight="medium" className="mt-3 text-caption text-error">
                  {describeServerError(
                    deleteAccount.error,
                    "Не удалось удалить аккаунт. Попробуйте ещё раз.",
                  )}
                </AppText>
              ) : null}

              <View className="mt-5 gap-3">
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSubmit}
                  onPress={handleDelete}
                  className={`h-12 items-center justify-center rounded-md ${
                    canSubmit ? "bg-error active:opacity-80" : "bg-surface-3"
                  }`}
                >
                  <AppText weight="semibold" className="text-button text-on-primary">
                    {isBusy ? "Удаляем..." : "Удалить аккаунт"}
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={close}
                  className="min-h-12 items-center justify-center rounded-md border border-hairline active:opacity-70"
                >
                  <AppText weight="semibold" className="text-button text-ink">
                    Отмена
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
