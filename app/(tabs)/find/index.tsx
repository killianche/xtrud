/**
 * /find — вкладка «Найти задание»: сначала выбор работы и места, как поиск
 * у Airbnb (владелец, 2026-10-03), задания — на /find/results.
 *
 * Верх — тот же механизм, что у «Мои» и «Специалисты»: крупный заголовок в
 * начале списка, компактный с размытием проявляется при прокрутке.
 * Это таб, а не detail-экран: нижняя панель не скрывается, «назад» нет.
 */

import { View } from "react-native";
import { LargeTitleBar, useLargeTitle } from "@/components/ui/LargeTitle";
import { FindSearch } from "@/features/orders/find/FindSearch";

export default function FindScreen() {
  // Строки с кнопками в покое нет — стартовая высота 0, без прыжка на
  // первом кадре (QA 2026-09-22).
  const large = useLargeTitle(0);
  return (
    <View className="flex-1 bg-surface-page">
      <FindSearch contentTop={large.contentTop} onScroll={large.onScroll} />
      <LargeTitleBar
        title="Найти задание"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />
    </View>
  );
}
