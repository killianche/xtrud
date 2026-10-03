/**
 * /find — вкладка «Найти задание»: разделы карточками → /find/section
 * (подразделы) → /find/results (задания). Владелец, 2026-10-03, №158.
 *
 * Верх — тот же механизм, что у «Мои» и «Специалисты»: крупный заголовок в
 * начале списка, компактный с размытием проявляется при прокрутке.
 * Это таб, а не detail-экран: нижняя панель не скрывается, «назад» нет.
 */

import { View } from "react-native";
import { LargeTitleBar, useLargeTitle } from "@/components/ui/LargeTitle";
import { FindHome } from "@/features/orders/find/FindHome";

export default function FindScreen() {
  // Строки с кнопками в покое нет — стартовая высота 0, без прыжка на
  // первом кадре (QA 2026-09-22).
  const large = useLargeTitle(0);
  return (
    <View className="flex-1 bg-surface-page">
      <FindHome contentTop={large.contentTop} onScroll={large.onScroll} />
      <LargeTitleBar
        title="Найти задание"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />
    </View>
  );
}
