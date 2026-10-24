/**
 * /profile/specialist/photo — фото профиля как шаг заполнения (№362).
 * Раньше этот пункт открывал весь экран личных данных («Отмена / Профиль /
 * Сохранить»), и после него человек снова оказывался на главной. Здесь одно
 * действие — выбрать фото; оно сохраняется сразу после загрузки, как в
 * onboarding (master-photo.tsx). Имя и удаление фото — по-прежнему в
 * «Имя и фото» (edit-client.tsx).
 */

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Camera } from "phosphor-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useUpdateMyAvatar } from "@/features/profile/use-update-my-avatar";
import { fillPrimaryLabel, fillStepLabel } from "@/features/specialist/profile-fill-flow";
import { useProfileFillFlow } from "@/features/specialist/use-profile-fill-flow";
import { realAvatarUrl } from "@/lib/avatar";
import { useThemeColors } from "@/lib/use-theme-color";

const SIZE = 160;

export default function SpecialistPhotoScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const updateAvatar = useUpdateMyAvatar(userId);
  const { flow, next } = useProfileFillFlow();
  const tc = useThemeColors(["accent"]);

  // Только настоящее фото: заглушка-генератор не считается (src/lib/avatar.ts).
  const avatarUrl = realAvatarUrl(user?.avatar_url);
  const hasPhoto = !!avatarUrl;
  const busy = updateAvatar.isPending;

  return (
    <FormScreen
      title="Фото профиля"
      subtitle={flow ? fillStepLabel(flow) : "Настоящее фото, на котором видно лицо."}
      onBack={() => router.back()}
      primaryLabel={flow ? fillPrimaryLabel(flow) : "Готово"}
      onPrimary={flow ? next : () => router.back()}
      primaryDisabled={!hasPhoto || busy}
      secondaryLabel={flow && !hasPhoto ? "Пропустить" : undefined}
      onSecondary={next}
      error={updateAvatar.error ? "Не удалось загрузить. Попробуйте ещё раз." : null}
    >
      <View className="items-center px-5 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? "Заменить фото профиля" : "Выбрать фото профиля"}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => updateAvatar.mutate()}
          className="items-center justify-center overflow-hidden rounded-full bg-surface-card active:opacity-80"
          style={{ width: SIZE, height: SIZE }}
        >
          {busy ? (
            <ActivityIndicator color={tc.accent} />
          ) : hasPhoto ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: SIZE, height: SIZE }}
              contentFit="cover"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <SystemIcon
              sf="camera.fill"
              fallback={Camera}
              size={36}
              weight="regular"
              color={tc.accent}
            />
          )}
        </Pressable>
        <AppText className="mt-4 text-center text-ios-subheadline text-mute">
          {busy ? "Загружаем…" : hasPhoto ? "Нажмите, чтобы заменить" : "Нажмите, чтобы выбрать"}
        </AppText>
      </View>
    </FormScreen>
  );
}
