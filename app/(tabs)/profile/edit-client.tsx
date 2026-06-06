/**
 * Edit-client — экран редактирования базовой инфы клиента (Linear/Bluesky-стиль).
 *
 * Поля: имя, фамилия, город (BD `cities` id), район.
 * Master редактирует расширенный набор полей через edit-master.tsx.
 *
 * Дизайн-паттерны (Lazyweb: Bluesky / Medium / Linear / Replit):
 *   - Header navbar: «Отмена» / Заголовок по центру / «Сохранить» (accent если dirty)
 *   - Section captions UPPERCASE / mute / caption-size
 *   - Inputs в bordered-cards с тонким hairline-разделителем между полями
 *   - Save floats up в навбар, не отдельная кнопка внизу
 */

import { useRouter } from "expo-router";
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
import { UsernameField } from "@/features/auth/UsernameField";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { setUsernameErrorMessage, useSetUsername } from "@/features/auth/use-username";
import { formatPhoneMask } from "@/features/auth/validation";
import { ChangePhoneSheet } from "@/features/profile/ChangePhoneSheet";
import { useUpdateMyProfile } from "@/features/profile/use-update-my-profile";
import { useUserPrivate } from "@/features/profile/use-user-private";
import { confirmAsync } from "@/lib/confirm";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function EditClientScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const { data: userPrivate } = useUserPrivate(userId);
  const update = useUpdateMyProfile(userId);
  const setUsernameMut = useSetUsername();
  const tc = useThemeColors(["ink", "mute", "muted-soft", "accent"]);
  // safeBack — fallback /(tabs)/profile, потому что edit-client открывается
  // из /profile, и при cross-stack push'е expo-router теряет history.
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const [firstName, setFirstName] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameValid, setUsernameValid] = useState(true);
  const [didInit, setDidInit] = useState(false);
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
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

  // Валидность юзернейма блокирует сохранение ТОЛЬКО если юзернейм реально
  // меняли. Раньше canSave требовал usernameValid всегда, поэтому пустое или
  // недопечатанное поле юзернейма не давало сохранить даже изменённое имя
  // (баг владельца: «Сохранить не активируется»). Если юзернейм не трогали —
  // его состояние неважно для сохранения имени.
  const usernameOkForSave = !usernameChanged || usernameValid;

  const canSave =
    firstName.trim().length >= 2 &&
    usernameOkForSave &&
    isDirty &&
    !update.isPending &&
    !setUsernameMut.isPending;

  const onSave = async () => {
    if (!canSave) return;
    setSaveError(null);
    try {
      // Сначала юзернейм (если менялся), потом имя.
      if (usernameChanged && usernameValue.trim().length > 0) {
        await setUsernameMut.mutateAsync({ username: usernameValue, userId: userId ?? "" });
      }
      await update.mutateAsync({ first_name: firstName });
      goBack();
    } catch (e) {
      // Ошибку показываем строкой на экране (Alert.alert — no-op на вебе,
      // сообщение бы потерялось).
      const msg = e instanceof Error ? setUsernameErrorMessage(e.message) : "Не удалось сохранить";
      setSaveError(msg);
    }
  };

  const onCancel = async () => {
    if (isDirty) {
      // confirmAsync — web-safe (на вебе Alert.alert не показывается, кнопка
      // «Отмена» молчала). На вебе → window.confirm, на native → Alert.
      const ok = await confirmAsync({
        title: "Отменить изменения?",
        message: "Несохранённые правки будут потеряны.",
        confirmText: "Отменить",
        cancelText: "Продолжить редактирование",
        destructive: true,
      });
      if (ok) goBack();
      return;
    }
    goBack();
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
          onPress={onCancel}
          hitSlop={12}
          className="min-w-[64px] active:opacity-60"
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
          {update.isPending ? (
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
            Секция «ВАШЕ ИМЯ» — Linear/Bluesky паттерн: маленький uppercase
            label + единая карточка с двумя строками inputs, разделённых
            hairline'ом. Без border на самих TextInput.
        ============================================================ */}
        <SectionCaption>Ваше имя</SectionCaption>
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
        </View>
        {firstName.trim().length < 2 ? (
          <AppText className="mt-2 px-4 text-caption text-error">
            Имя — минимум 2 символа.
          </AppText>
        ) : null}

        {/* Юзернейм — уникальный публичный @идентификатор, можно менять. */}
        <View className="mt-6 px-4">
          <UsernameField
            value={usernameValue}
            onChange={(next) => {
              setSaveError(null);
              setUsernameValue(next);
            }}
            onValidityChange={setUsernameValid}
            currentUsername={user?.username ?? null}
            editable={!update.isPending && !setUsernameMut.isPending}
          />
        </View>

        {/* Ошибка сохранения — показываем строкой (Alert.alert немой на вебе). */}
        {saveError ? (
          <AppText weight="medium" className="mt-3 px-4 text-caption text-error">
            {saveError}
          </AppText>
        ) : null}

        {/* ============================================================
            Секция «КОНТАКТ» — номер телефона (read-only display + change-flow).
            Архитектура phone — в `src/features/profile/use-user-private.ts`:
            сейчас он живёт в `users_private.phone`, потому что Phone Provider
            в Supabase Auth ещё не подключён (Sprint 1). Когда подключим —
            переедет на `auth.users.phone`. UI остаётся прежним.
        ============================================================ */}
        <SectionCaption>Контакт</SectionCaption>
        <View className="mx-4 overflow-hidden rounded-lg border border-hairline bg-canvas">
          <View className="flex-row items-center gap-3 px-4 py-3">
            <AppText weight="medium" className="w-20 text-body-md text-mute">
              Телефон
            </AppText>
            <AppText
              weight="medium"
              className="flex-1 text-body-md text-ink"
              numberOfLines={1}
            >
              {userPrivate?.phone
                ? formatPhoneMask(userPrivate.phone)
                : "Не указан"}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сменить номер"
              onPress={() => setChangePhoneOpen(true)}
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

      <ChangePhoneSheet
        open={changePhoneOpen}
        onClose={() => setChangePhoneOpen(false)}
        userId={userId}
        currentPhone={userPrivate?.phone ?? null}
      />
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
      <AppText weight="medium" className="w-20 text-body-md text-mute">
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
      maxFontSizeMultiplier={1.3}
      className="text-body-md text-ink"
      style={
        // web-only: убираем синий focus outline у нативного <input>
        { color: tc.ink, outlineWidth: 0, outlineStyle: "none", paddingVertical: 4 } as object
      }
    />
  );
}
