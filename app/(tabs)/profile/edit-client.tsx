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
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useUpdateMyProfile } from "@/features/profile/use-update-my-profile";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function EditClientScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const update = useUpdateMyProfile(userId);
  const tc = useThemeColors(["ink", "mute", "muted-soft", "accent"]);
  // safeBack — fallback /(tabs)/profile, потому что edit-client открывается
  // из /profile, и при cross-stack push'е expo-router теряет history.
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [didInit, setDidInit] = useState(false);

  // Один раз префиллим форму актуальными значениями после загрузки user.
  useEffect(() => {
    if (!user || didInit) return;
    setFirstName(user.first_name ?? "");
    setLastName(user.last_name ?? "");
    setDidInit(true);
  }, [user, didInit]);

  const isDirty =
    didInit &&
    ((firstName ?? "") !== (user?.first_name ?? "") ||
      (lastName ?? "") !== (user?.last_name ?? ""));

  const canSave = firstName.trim().length >= 2 && isDirty && !update.isPending;

  const onSave = () => {
    if (!canSave) return;
    update.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        // city_id / district 2026-05-16: не сохраняем — поле UI убрано.
      },
      {
        onSuccess: () => goBack(),
        onError: (e) => Alert.alert("Не удалось сохранить", e.message),
      },
    );
  };

  const onCancel = () => {
    if (isDirty) {
      Alert.alert("Отменить изменения?", "Несохранённые правки будут потеряны.", [
        { text: "Продолжить редактирование", style: "cancel" },
        { text: "Отменить", style: "destructive", onPress: () => goBack() },
      ]);
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
              onChangeText={setFirstName}
              placeholder="Алина"
              autoCapitalize="words"
              maxLength={50}
            />
          </FieldRow>
          <View className="h-px bg-hairline mx-4" />
          <FieldRow label="Фамилия">
            <NakedInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Тестова"
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
