/**
 * Edit-client — экран редактирования профиля клиента (Telegram / Bluesky-стиль).
 *
 * Поля: фото профиля, имя, юзернейм (@handle), номер телефона.
 * Master редактирует расширенный набор полей через edit-master.tsx.
 *
 * Дизайн-паттерны (Lazyweb 2026-06-06: Telegram / Bluesky / Waze edit-profile):
 *   - Header navbar: «Отмена» / Заголовок по центру / «Сохранить» (accent если можно).
 *   - Фото профиля HERO сверху — тапается, камера-бейдж, меню «сменить/удалить».
 *   - Имя + юзернейм в ОДНОЙ карточке «Профиль» (это публичная личность),
 *     разделены hairline'ом. Юзернейм со статусом «свободно/занято» прямо в строке.
 *   - Телефон в карточке «Контакт» со скелетоном на время загрузки (без мелькания
 *     «Не указан» у тех, у кого номер есть).
 *   - Save floats up в навбар. Когда «Сохранить» серый — под формой видно ПОЧЕМУ
 *     (имя коротко / юзернейм занят / проверяем) — раньше владелец не понимал,
 *     почему кнопка неактивна («юзернейм не меняется»).
 */

import { useRouter } from "expo-router";
import { Camera } from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/ui";
import { UsernameField } from "@/features/auth/UsernameField";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { setUsernameErrorMessage, useSetUsername } from "@/features/auth/use-username";
import { formatPhoneMask } from "@/features/auth/validation";
import { useRemoveMyAvatar, useUpdateMyAvatar } from "@/features/profile/use-update-my-avatar";
import { useUpdateMyProfile } from "@/features/profile/use-update-my-profile";
import { useUserPrivate } from "@/features/profile/use-user-private";
import { confirmAsync } from "@/lib/confirm";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

export default function EditClientScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const { data: userPrivate, isLoading: phoneLoading } = useUserPrivate(userId);
  const update = useUpdateMyProfile(userId);
  const setUsernameMut = useSetUsername();
  const updateAvatar = useUpdateMyAvatar(userId);
  const removeAvatar = useRemoveMyAvatar(userId);
  const tc = useThemeColors(["ink", "mute", "muted-soft", "accent", "on-primary"]);
  // safeBack — fallback /(tabs)/profile, потому что edit-client открывается
  // из /profile, и при cross-stack push'е expo-router теряет history.
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const [firstName, setFirstName] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameValid, setUsernameValid] = useState(true);
  const [didInit, setDidInit] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Один раз префиллим форму актуальными значениями после загрузки user.
  useEffect(() => {
    if (!user || didInit) return;
    setFirstName(user.first_name ?? "");
    setUsernameValue(user.username ?? "");
    setDidInit(true);
  }, [user, didInit]);

  // Фамилия убрана 2026-05-29 — везде только имя.
  const nameChanged = didInit && (firstName ?? "") !== (user?.first_name ?? "");
  const usernameChanged = didInit && (usernameValue ?? "") !== (user?.username ?? "");
  const isDirty = nameChanged || usernameChanged;
  const nameOk = firstName.trim().length >= 2;

  // Валидность юзернейма блокирует сохранение ТОЛЬКО если юзернейм реально
  // меняли. Раньше canSave требовал usernameValid всегда, поэтому пустое или
  // недопечатанное поле юзернейма не давало сохранить даже изменённое имя
  // (баг владельца: «Сохранить не активируется»). Если юзернейм не трогали —
  // его состояние неважно для сохранения имени.
  const usernameOkForSave = !usernameChanged || usernameValid;

  const isSaving = update.isPending || setUsernameMut.isPending;
  const canSave = nameOk && usernameOkForSave && isDirty && !isSaving;
  const allowSavedNavigation = useUnsavedChangesGuard({
    hasUnsavedChanges: isDirty,
    isBusy: isSaving,
  });

  // Почему «Сохранить» неактивна — показываем явной строкой под формой, чтобы
  // владелец не гадал. Приоритет: сначала имя, потом юзернейм. Если изменений
  // нет (isDirty=false) — никакой подсказки (нечего сохранять, это норма).
  let disabledReason: string | null = null;
  if (!isSaving && isDirty && !canSave) {
    if (!nameOk) {
      disabledReason = "Впишите имя — минимум 2 символа.";
    } else if (usernameChanged && !usernameValid) {
      disabledReason = "Выберите свободный юзернейм, чтобы сохранить.";
    }
  }

  const onSave = async () => {
    if (!canSave) return;
    setSaveError(null);
    try {
      // Сначала юзернейм (если менялся), потом имя.
      if (usernameChanged && usernameValue.trim().length > 0) {
        await setUsernameMut.mutateAsync({ username: usernameValue, userId: userId ?? "" });
      }
      if (nameChanged) {
        await update.mutateAsync({ first_name: firstName });
      }
      allowSavedNavigation();
      goBack();
    } catch (e) {
      // Ошибку показываем строкой на экране (Alert.alert — no-op на вебе,
      // сообщение бы потерялось).
      const msg = e instanceof Error ? setUsernameErrorMessage(e.message) : "Не удалось сохранить";
      setSaveError(msg);
    }
  };

  // The removal guard owns both this visible action and the iOS edge-swipe.
  const onCancel = goBack;

  // Меню фото профиля (Telegram/Bluesky/Instagram): тап по аватару →
  // нет фото → сразу выбор файла; есть фото → confirm «удалить?» (ОК —
  // удалить, Отмена — выбрать другое). На native — то же через confirmAsync.
  const avatarBusy = updateAvatar.isPending || removeAvatar.isPending;
  const onAvatarPress = async () => {
    if (avatarBusy) return;
    if (!user?.avatar_url) {
      updateAvatar.mutate(undefined, {
        onError: (e) => setSaveError(e.message),
      });
      return;
    }
    const remove = await confirmAsync({
      title: "Фото профиля",
      message: "Удалить текущее фото? Нажмите «Отмена», чтобы выбрать другое.",
      confirmText: "Удалить",
      cancelText: "Выбрать другое",
      destructive: true,
    });
    if (remove) {
      removeAvatar.mutate(undefined, { onError: (e) => setSaveError(e.message) });
    } else {
      updateAvatar.mutate(undefined, { onError: (e) => setSaveError(e.message) });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas-soft"
      style={{ paddingTop: insets.top }}
    >
      {/* Header navbar — Cancel / Title / Save */}
      <View className="flex-row items-center justify-between border-hairline border-b bg-canvas px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отмена"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onCancel}
          hitSlop={12}
          className={`min-w-[64px] active:opacity-60 ${isSaving ? "opacity-40" : ""}`}
        >
          <AppText weight="medium" className="text-body-md text-ink">
            Отмена
          </AppText>
        </Pressable>
        <AppText weight="semibold" className="text-title-md text-ink">
          Профиль
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Сохранить"
          onPress={onSave}
          disabled={!canSave}
          hitSlop={12}
          className="min-w-[64px] items-end active:opacity-60"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={tc.accent} />
          ) : (
            <AppText
              weight="semibold"
              className={`text-body-md ${canSave ? "text-accent" : "text-muted-soft"}`}
            >
              Сохранить
            </AppText>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ============================================================
            Фото профиля HERO — тап открывает меню «сменить/удалить».
            Камера-бейдж подсказывает, что фото редактируемо (как в Telegram).
        ============================================================ */}
        <View className="items-center pt-6 pb-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Фото профиля — изменить"
            onPress={onAvatarPress}
            disabled={avatarBusy}
            className="relative active:opacity-90"
          >
            <Avatar
              url={user?.avatar_url}
              name={firstName || user?.first_name}
              seed={user?.id}
              size="xl"
            />
            <View className="-bottom-0.5 -right-0.5 absolute h-8 w-8 items-center justify-center rounded-full border-2 border-canvas-soft bg-ink">
              {avatarBusy ? (
                <ActivityIndicator size="small" color={tc["on-primary"]} />
              ) : (
                <Camera size={15} weight="fill" color={tc["on-primary"]} />
              )}
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Изменить фото"
            onPress={onAvatarPress}
            disabled={avatarBusy}
            hitSlop={8}
            className="mt-3 active:opacity-60"
          >
            <AppText weight="semibold" className="text-body-sm text-accent">
              {user?.avatar_url ? "Изменить фото" : "Добавить фото"}
            </AppText>
          </Pressable>
        </View>

        {/* ============================================================
            Секция «ПРОФИЛЬ» — имя + юзернейм в одной карточке (это публичная
            личность). Разделены hairline'ом. Юзернейм со своим живым статусом
            (свободно/занято/проверяем) прямо под строкой.
        ============================================================ */}
        <SectionCaption>Профиль</SectionCaption>
        <View className="mx-4 overflow-hidden rounded-lg border border-hairline bg-canvas">
          <FieldRow label="Имя">
            <NakedInput
              value={firstName}
              onChangeText={(v) => {
                setSaveError(null);
                setFirstName(v);
              }}
              placeholder="Алина"
              autoCapitalize="words"
              maxLength={50}
            />
          </FieldRow>

          <View className="h-px bg-hairline" />

          <View className="px-4 py-2.5">
            <UsernameField
              variant="row"
              value={usernameValue}
              onChange={(next) => {
                setSaveError(null);
                setUsernameValue(next);
              }}
              onValidityChange={setUsernameValid}
              currentUsername={user?.username ?? null}
              editable={!isSaving}
            />
          </View>
        </View>

        {/* Подсказка ПОЧЕМУ «Сохранить» серая — чтобы владелец не гадал. */}
        {disabledReason ? (
          <AppText weight="medium" className="mt-2 px-4 text-caption text-mute">
            {disabledReason}
          </AppText>
        ) : null}

        {/* Ошибка сохранения — показываем строкой (Alert.alert немой на вебе). */}
        {saveError ? (
          <AppText weight="medium" className="mt-2 px-4 text-caption text-error">
            {saveError}
          </AppText>
        ) : null}

        {/* ============================================================
            Секция «КОНТАКТ» — номер телефона (read-only display + change-flow).
            Телефон живёт в `users_private.phone` (Phone Provider в Supabase Auth
            ещё не подключён). На время загрузки — скелетон, чтобы у тех, у кого
            номер есть, не мелькало «Не указан».
        ============================================================ */}
        <SectionCaption>Контакт</SectionCaption>
        <View className="mx-4 overflow-hidden rounded-lg border border-hairline bg-canvas">
          <View className="flex-row items-center gap-2 px-4 py-3">
            <AppText weight="medium" className="text-body-md text-mute">
              Телефон
            </AppText>
            {phoneLoading && !userPrivate ? (
              <View className="flex-1 items-end">
                <Skeleton width={150} height={18} style={{ borderRadius: 6 }} />
              </View>
            ) : (
              <AppText
                weight="medium"
                className="flex-1 text-right text-body-md text-ink"
                numberOfLines={1}
              >
                {userPrivate?.phone ? formatPhoneMask(userPrivate.phone) : "Не указан"}
              </AppText>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сменить номер"
              onPress={() => router.push("/profile/change-phone" as never)}
              hitSlop={8}
              className="active:opacity-60"
            >
              <AppText weight="semibold" className="text-body-sm text-accent">
                {userPrivate?.phone ? "Изменить" : "Указать"}
              </AppText>
            </Pressable>
          </View>
        </View>
        <AppText className="mt-2 px-4 text-caption text-mute">
          Ваш номер всегда скрыт от мастеров. Вы сами звоните тем, кто откликнулся.
        </AppText>

        {/* Секция «Где вы живёте» удалена 2026-05-16: личный город/район
            клиента не используется в продукте. Мастера прикрепляются к
            районам через master_service_areas. */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SectionCaption({ children }: { children: string }) {
  return (
    <AppText
      weight="medium"
      className="mt-6 mb-2 px-4 text-caption text-mute"
      style={{ letterSpacing: 0.5, textTransform: "uppercase" }}
    >
      {children}
    </AppText>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-2.5">
      <AppText weight="medium" className="w-24 text-body-md text-mute">
        {label}
      </AppText>
      <View className="flex-1">{children}</View>
    </View>
  );
}

interface NakedInputProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
}

function NakedInput({
  value,
  onChangeText,
  placeholder,
  autoCapitalize = "sentences",
  maxLength,
}: NakedInputProps) {
  const tc = useThemeColors(["ink", "muted-soft"]);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={tc["muted-soft"]}
      autoCapitalize={autoCapitalize}
      maxLength={maxLength}
      className="text-body-md text-ink"
      style={
        // web-only: убираем синий focus outline у нативного <input>
        { color: tc.ink, outlineWidth: 0, outlineStyle: "none", paddingVertical: 4 } as object
      }
    />
  );
}
