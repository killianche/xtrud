/**
 * MasterViewStatsCard — счётчик просмотров за 7 дней на главной мастера.
 *
 * Источник данных: RPC get_my_master_view_stats (миграция 0096).
 *
 * Дизайн (2026-05-24, редизайн верхней сводки «убрать лишнее, сделать красиво»):
 * статистика встроена в приветственный блок как тихая вторая строка под именем
 * мастера — не отдельный «техно-ряд» с иконкой-графиком и разделителями.
 * Одна спокойная строка muted-тоном, цифры выделены ink+mono. Это убирает
 * третий «голос» из сводки: greeting + метрики читаются как один блок.
 * Рендерится без обёртки/паддингов — позиционирование задаёт родитель.
 * Loading и 0/0 — валидные состояния (0/0 не ошибка, у новых мастеров нормально).
 */
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { useMyMasterViewStats } from "@/features/master-view/use-my-view-stats";

interface MasterViewStatsCardProps {
  userId: string | null;
}

export function MasterViewStatsCard({ userId }: MasterViewStatsCardProps) {
  const { data, isLoading } = useMyMasterViewStats(userId);

  const impressions = isLoading ? "…" : String(data?.impressions ?? 0);
  const opens = isLoading ? "…" : String(data?.profile_opens ?? 0);

  return (
    <View className="flex-row flex-wrap items-center gap-x-1 gap-y-0.5">
      <AppText className="text-body-sm text-mute">За неделю:</AppText>
      <AppText weight="mono" className="text-body-sm text-ink">
        {impressions}
      </AppText>
      <AppText className="text-body-sm text-mute">показов ·</AppText>
      <AppText weight="mono" className="text-body-sm text-ink">
        {opens}
      </AppText>
      <AppText className="text-body-sm text-mute">открыли профиль</AppText>
    </View>
  );
}
