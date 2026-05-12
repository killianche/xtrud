import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Camera } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useUpdateMyAvatar } from "@/features/profile/use-update-my-avatar";
import { useThemeColor } from "@/lib/use-theme-color";

// Master onboarding flow: role → categories → photo → profile.
// Этот экран — шаг 3 из 4. Фото — опциональное (skip разрешён), но мотивируем
// мастера добавить: принцип №2 «фото — главный визуальный нерв», карточка без
// фото получает заметно меньше откликов.
export default function MasterPhotoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const updateAvatar = useUpdateMyAvatar(userId);
  const mutedSoftColor = useThemeColor("muted-soft");

  const avatarUrl = user?.avatar_url ?? null;
  const hasPhoto = !!avatarUrl;
  const isBusy = updateAvatar.isPending;

  const goNext = () => router.push("/(onboarding)/master-profile");

  const onPickPhoto = () => {
    updateAvatar.mutate();
  };

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <OnboardingProgress step={3} total={4} />

      <View className="flex-1 justify-between px-6 pt-10">
        <View>
          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            Добавьте фото
          </AppText>
          <AppText className="mt-3 text-body-md text-body">
            Фото повышает доверие клиентов — карточки с реальным фото получают больше откликов.
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
                <Camera size={36} strokeWidth={1.5} color={mutedSoftColor} />
              )}
            </Pressable>

            <AppText weight="medium" className="mt-5 text-caption text-muted-soft">
              {hasPhoto
                ? isBusy
                  ? "Загружаем…"
                  : "Нажмите, чтобы заменить"
                : isBusy
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
            onPress={goNext}
            className={`h-12 items-center justify-center rounded-md ${
              !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              Продолжить
            </AppText>
          </Pressable>

          {!hasPhoto && (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={goNext}
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
