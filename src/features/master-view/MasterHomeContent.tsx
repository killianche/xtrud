// Контент главной для active_role='master'.
//
// Структура (после фидбека user 2026-05-15):
//   1. AvailabilitySwitcher (статус online / готов сегодня / на неделе / недоступен)
//   2. MasterStatsBlock — полноценная статистика (лимит откликов сегодня
//      с прогресс-баром + 3 tile'а: отправил/выбрали/завершил)
//   3. CTA «Добавьте категории» если у мастера их нет
//
// Что УБРАНО (3 правки 2026-05-15):
//   - Чёрный CTA «Поиск заказов» — поиск теперь в TabBar (иконка Search)
//   - Блок «Новые заказы» лента — мастер заходит в search или /orders
//   - Маленький бейдж «5 откликов сегодня» — заменён на MasterStatsBlock

import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { AvailabilitySwitcher } from "@/features/master-view/AvailabilitySwitcher";
import { MasterStatsBlock } from "@/features/master-view/MasterStatsBlock";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useThemeColors } from "@/lib/use-theme-color";

interface MasterHomeContentProps {
  userId: string;
}

export function MasterHomeContent({ userId }: MasterHomeContentProps) {
  const router = useRouter();
  const { data: myCats } = useMyMasterCategories(userId);
  const tc = useThemeColors(["accent", "muted-soft", "on-primary"]);

  const hasCategories = (myCats?.length ?? 0) > 0;

  return (
    <View className="gap-6 px-6">
      {/* Availability switcher — наверху, как «онлайн» в такси */}
      <AvailabilitySwitcher userId={userId} />

      {/* Полноценная статистика мастера: лимит откликов + отправил /
          выбрали / завершил. */}
      <MasterStatsBlock />

      {/* Если у мастера НЕТ категорий — единственная CTA «Добавьте». */}
      {!hasCategories ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(onboarding)/master-categories")}
          className="flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
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
      ) : null}
    </View>
  );
}
