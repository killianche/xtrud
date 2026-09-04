// OrderRowsSkeleton — N skeleton-карточек по форме OrderRow.
//
// Показывается вместо <ActivityIndicator/> при загрузке любой ленты заданий.
// См. UI_PATTERNS.md §3.7 «Skeleton по форме реальной карточки».
//
// Форма совпадает с карточкой OrderRow (стандарт 2026-09-02):
//   - карточка с рамкой и радиусом 16, отступы 16, между карточками 12
//   - плитка категории 44×44 слева + строка категории и время справа
//   - заголовок 18 px, две строки-меты 16 px с иконками, цена 18 px

import { View } from "react-native";
import { Skeleton } from "@/components/Skeleton";

export function OrderRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="pt-1">
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
        <View key={i} className="mx-4 mb-3 rounded-2xl border border-hairline bg-surface-card p-4">
          <View className="flex-row items-center gap-3">
            <Skeleton width={44} height={44} className="rounded-xl" />
            <Skeleton width="40%" height={14} className="rounded" />
            <View className="flex-1" />
            <Skeleton width={32} height={14} className="rounded" />
          </View>
          <Skeleton width="80%" height={18} className="mt-4 rounded" />
          <Skeleton width="95%" height={16} className="mt-3 rounded" />
          <Skeleton width="55%" height={16} className="mt-2 rounded" />
          <View className="mt-4 flex-row items-center gap-2">
            <Skeleton width={18} height={18} className="rounded-full" />
            <Skeleton width="45%" height={16} className="rounded" />
          </View>
          <View className="mt-2 flex-row items-center gap-2">
            <Skeleton width={18} height={18} className="rounded-full" />
            <Skeleton width="35%" height={16} className="rounded" />
          </View>
          <Skeleton width="30%" height={18} className="mt-4 rounded" />
        </View>
      ))}
    </View>
  );
}
