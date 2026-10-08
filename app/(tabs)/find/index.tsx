/**
 * /find — вкладка «Найти задание»: сразу список заданий и «Фильтры»
 * (владелец, 2026-10-05, №235; раньше — плитки разделов → подразделы →
 * задания, №158/№205). Категория и место — шторки `/find-category`, `/find-place` (№238).
 *
 * Верх: крупный заголовок в начале списка; при прокрутке компактного
 * заголовка и полосы с размытием нет — только затемнение под часами
 * (владелец, 2026-10-08, №323).
 */

import { View } from "react-native";
import { StatusBarScrollEdge, useLargeTitle } from "@/components/ui/LargeTitle";
import { FindFeed } from "@/features/orders/find/FindFeed";

export default function FindScreen() {
  // Строки с кнопками в покое нет — стартовая высота 0, без прыжка на
  // первом кадре (QA 2026-09-22).
  const large = useLargeTitle(0);
  return (
    <View className="flex-1 bg-surface-page">
      <FindFeed contentTop={large.contentTop} onScroll={large.onScroll} />
      <StatusBarScrollEdge opacity={large.compactTitleOpacity} />
    </View>
  );
}
