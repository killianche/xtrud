/**
 * Веб-вариант SegmentPager: у react-native-pager-view нет веб-реализации
 * (импорт нативного модуля ломает веб-сборку), поэтому здесь — только
 * активная страница, переключение — сегментом.
 */

import { Children, type ReactNode } from "react";
import { View } from "react-native";

export function SegmentPager({
  page,
  children,
}: {
  page: number;
  onPageChange: (index: number) => void;
  children: ReactNode;
}) {
  return <View style={{ flex: 1 }}>{Children.toArray(children)[page] ?? null}</View>;
}
