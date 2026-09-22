/**
 * /find — вкладка «Найти задание»: лента открытых заданий с поиском и
 * фильтром внутри списка (docs/FIND_SCREEN_REDESIGN.md, редизайн 2026-09-21).
 *
 * Верх — тот же механизм, что у «Мои» и «Специалисты»: крупный заголовок в
 * начале списка, компактный проявляется при прокрутке (LargeTitleBar).
 * Это таб, а не detail-экран: нижняя панель не скрывается, «назад» нет.
 */

import { View } from "react-native";
import { LargeTitleBar, useLargeTitle } from "@/components/ui/LargeTitle";
import { FindFeed } from "@/features/orders/find/FindFeed";

export default function FindScreen() {
  // Строки с кнопками в покое нет — стартовая высота 0, без прыжка на
  // первом кадре (QA 2026-09-22).
  const large = useLargeTitle(0);
  return (
    <View className="flex-1 bg-surface-page">
      <FindFeed contentTop={large.contentTop} onScroll={large.onScroll} />
      <LargeTitleBar
        title="Найти задание"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />
    </View>
  );
}
