// OrderRowsSkeleton — N skeleton-строк повторяющих форму OrderRow (list-style).
//
// Используется на всех master-листингах вместо <ActivityIndicator/> при загрузке.
// См. UI_PATTERNS.md §3.7 «Skeleton по форме реальной карточки» и §3.3 OrderRow.
//
// Структура совпадает с OrderRow:
//   - иконка 36×36 rounded-lg слева
//   - 3 строки текста справа (title 16px, eyebrow 12px, meta 12px)
//   - time 24×12 справа сверху
//   - border-b разделитель снизу
//   - padding px-5 py-4 встроенный

import { View } from "react-native";
import { Skeleton } from "@/components/Skeleton";

export function OrderRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="mt-2">
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
        <View key={i} className="flex-row items-start gap-3 border-b border-hairline px-5 py-4">
          <Skeleton width={36} height={36} className="rounded-lg" />
          <View className="flex-1 gap-2">
            <Skeleton width="65%" height={16} className="rounded" />
            <Skeleton width="35%" height={12} className="rounded" />
            <Skeleton width="80%" height={12} className="rounded mt-1" />
          </View>
          <Skeleton width={24} height={12} className="rounded mt-0.5" />
        </View>
      ))}
    </View>
  );
}
