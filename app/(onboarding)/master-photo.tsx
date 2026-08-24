import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Camera } from "phosphor-react-native";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useExitOnboarding } from "@/features/auth/use-exit-onboarding";
import { useFinalizeMasterOnboarding } from "@/features/auth/use-finalize-master-onboarding";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useUpdateMyAvatar } from "@/features/profile/use-update-my-avatar";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { realAvatarUrl } from "@/lib/avatar";
import { useThemeColor } from "@/lib/use-theme-color";

// Master onboarding flow (Sprint 2026-05-20 reorder): role → master-profile
// (1/3 имя/опыт/whatsapp) → master-categories (2/3) → master-photo (3/3).
// Фото — опциональное (skip разрешён), но мотивируем мастера добавить:
// карточка без фото получает заметно меньше откликов.
//
// На этом шаге вызывается finalize_master_onboarding() RPC — ставит
// is_master=true + onboarding_completed_at=now() → AuthGate редиректит на
// /(tabs). До этого момента все данные (имя, категории, master_profiles row)
// уже сохранены на предыдущих шагах.

export default function MasterPhotoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const updateAvatar = useUpdateMyAvatar(userId);
  const finalize = useFinalizeMasterOnboarding(userId);
  const mutedSoftColor = useThemeColor("muted-soft");
  const { exit: exitOnboarding } = useExitOnboarding();

  // Только настоящее загруженное фото; DiceBear-заглушка → null → покажем
  // «Добавьте фото» (решение владельца 2026-05-23, src/lib/avatar.ts).
  const avatarUrl = realAvatarUrl(user?.avatar_url);
  const hasPhoto = !!avatarUrl;
  const isBusy = updateAvatar.isPending || finalize.isPending;

  const onFinalize = async () => {
    try {
      await finalize.mutateAsync();
      // Sprint 2026-05-20: если был сохранён return-URL (клиент стал мастером
      // через CTA «Откликнуться» на чужом заказе) — возвращаем его на тот
      // же заказ. Иначе AuthGate сам редиректит на /(tabs) по onboarding_completed_at.
      const returnUrl = useAuthReturnUrlStore.getState().consumeReturnUrl();
      if (returnUrl) {
        router.replace(returnUrl as never);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Неизвестная ошибка сервера.";
      console.error("[MasterPhoto finalize]", e);
      Alert.alert("Не удалось завершить регистрацию", message);
    }
  };

  const onPickPhoto = () => {
    updateAvatar.mutate();
  };

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <OnboardingProgress step={3} total={3} onCancel={exitOnboarding} />

      <View className="flex-1 justify-between px-6 pt-10">
        <View>
          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            Добавьте фото
          </AppText>

          <View className="mt-12 items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasPhoto ? "Заменить фото профиля" : "Выбрать фото профиля"}
              disabled={isBusy}
              onPress={onPickPhoto}
              className="h-44 w-44 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-2 active:opacity-80"
            >
              {hasPhoto ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: 176, height: 176 }}
                  contentFit="cover"
                  transition={150}
                />
              ) : isBusy ? (
                <ActivityIndicator />
              ) : (
                <Camera size={36} weight="bold" color={mutedSoftColor} />
              )}
            </Pressable>

            <AppText weight="medium" className="mt-5 text-caption text-muted-soft">
              {hasPhoto
                ? updateAvatar.isPending
                  ? "Загружаем…"
                  : "Нажмите, чтобы заменить"
                : updateAvatar.isPending
                  ? "Загружаем…"
                  : "Нажмите, чтобы выбрать"}
            </AppText>

            {updateAvatar.error && (
              <AppText weight="medium" className="mt-3 text-caption text-error">
                Не удалось загрузить. Попробуйте ещё раз.
              </AppText>
            )}
          </View>
        </View>

        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onFinalize}
            className={`h-12 items-center justify-center rounded-md ${
              !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {finalize.isPending ? "Завершаем..." : "Завершить"}
            </AppText>
          </Pressable>

          {!hasPhoto && (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={onFinalize}
              hitSlop={8}
              className="h-10 items-center justify-center"
            >
              <AppText weight="medium" className="text-body-md text-muted">
                Пропустить
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
