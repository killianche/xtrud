// Контент главной для active_role='master'.
// Структура: safety banner → ваши категории (или CTA добавить) → empty state ленты заявок.

import { useRouter } from "expo-router";
import { ChevronRight, Inbox, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SafetyBanner } from "@/components/SafetyBanner";
import { AvailabilitySwitcher } from "@/features/master-view/AvailabilitySwitcher";
import { ResponseLimitBadge } from "@/features/master-view/ResponseLimitBadge";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useThemeColors } from "@/lib/use-theme-color";

interface MasterHomeContentProps {
  userId: string;
}

export function MasterHomeContent({ userId }: MasterHomeContentProps) {
  const router = useRouter();
  const { data: myCats, isLoading } = useMyMasterCategories(userId);
  const tc = useThemeColors(["accent", "muted-soft", "on-primary"]);

  const hasCategories = (myCats?.length ?? 0) > 0;

  return (
    <View className="gap-6 px-6">
      {/* Availability switcher — наверху, как «онлайн» в такси */}
      <AvailabilitySwitcher userId={userId} />

      {/* P0-5: бейдж дневного лимита откликов (5 в день в free-tier).
          Self-start чтобы не растягивался на всю ширину. */}
      <ResponseLimitBadge />

      {/* Safety banner */}
      <SafetyBanner />

      {/* Категории */}
      <View>
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваши категории
        </AppText>

        {isLoading && (
          <View className="mt-3 items-start">
            <ActivityIndicator />
          </View>
        )}

        {!isLoading && !hasCategories && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(onboarding)/master-categories")}
            className="mt-3 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
          >
            <View className="flex-1">
              <AppText weight="semibold" className="text-body-md text-ink">
                Добавьте категории
              </AppText>
              <AppText className="mt-1 text-body-sm text-muted">
                Без категорий клиенты не увидят вас в каталоге.
              </AppText>
            </View>
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
              <Plus size={20} strokeWidth={2} color={tc["on-primary"]} />
            </View>
          </Pressable>
        )}

        {!isLoading && hasCategories && (
          <View className="mt-3">
            <View className="flex-row flex-wrap gap-2">
              {myCats?.map((mc) => (
                <View key={mc.id} className="rounded-pill bg-accent-soft px-3 py-2">
                  <AppText weight="medium" className="text-caption text-accent">
                    {mc.l2?.name_ru ?? mc.l2_id}
                  </AppText>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(onboarding)/master-categories")}
              className="mt-3 flex-row items-center gap-1 self-start active:opacity-70"
              hitSlop={8}
            >
              <AppText weight="medium" className="text-caption text-accent">
                Редактировать ({myCats?.length}/5)
              </AppText>
              <ChevronRight size={14} strokeWidth={2} color={tc.accent} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Empty state ленты заявок */}
      <View className="items-center rounded-lg bg-surface-2 px-6 py-10">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-3">
          <Inbox size={24} strokeWidth={1.75} color={tc["muted-soft"]} />
        </View>
        <AppText weight="semibold" className="mt-4 text-title-md text-ink">
          Заявок пока нет
        </AppText>
        <AppText className="mt-2 text-center text-body-sm text-muted">
          {hasCategories
            ? "Здесь появятся новые заявки клиентов по вашим категориям."
            : "Добавьте категории, чтобы получать заявки."}
        </AppText>
      </View>
    </View>
  );
}
