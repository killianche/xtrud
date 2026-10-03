/**
 * Страницы под сегментами — переключаются и тапом по сегменту, и свайпом
 * по экрану (владелец, 2026-10-03: «чтобы переключаться можно было свайпом
 * вправо-влево в центре экрана»).
 *
 * Механизм — react-native-pager-view: на iOS это системный
 * UIPageViewController, поэтому следование за пальцем, инерция и упругость
 * на краях — родные, а не повторённые жестом на JS (design-quality §1.1:
 * самописный аналог родного механизма — техдолг). Спецификация —
 * docs/CARD_AND_SEGMENTS_REDESIGN_2026-10.md §3.
 *
 * Источник правды — `page` у экрана: тап по сегменту меняет его, пейджер
 * догоняет; свайп сообщает новую страницу через onPageChange. При «Уменьшении
 * движения» программный переход — без анимации; свайп пальцем — прямое
 * управление, его система не отключает.
 *
 * В вебе у пейджера нет реализации — там SegmentPager.web.tsx.
 */

import { Children, type ReactNode, useEffect, useRef } from "react";
import { View } from "react-native";
import PagerView from "react-native-pager-view";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { hapticSelection } from "@/lib/haptics";

export function SegmentPager({
  page,
  onPageChange,
  children,
}: {
  page: number;
  onPageChange: (index: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<PagerView>(null);
  const reducedMotion = useReducedMotion();
  // Страница, на которой пейджер стоит сейчас, — чтобы не гонять его туда,
  // где он уже есть (после свайпа page приходит тем же числом).
  const shown = useRef(page);

  useEffect(() => {
    if (shown.current === page) return;
    shown.current = page;
    if (reducedMotion) ref.current?.setPageWithoutAnimation(page);
    else ref.current?.setPage(page);
  }, [page, reducedMotion]);

  const pages = Children.toArray(children);

  return (
    <PagerView
      ref={ref}
      style={{ flex: 1 }}
      initialPage={page}
      overdrag
      onPageSelected={(e) => {
        const next = e.nativeEvent.position;
        if (next === shown.current) return;
        shown.current = next;
        // Свайп — тот же отклик, что тап по сегменту.
        hapticSelection();
        onPageChange(next);
      }}
    >
      {/* Каждая страница — свой View на всю площадь (требование пейджера). */}
      {pages.map((child, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: страниц фиксированное число, порядок не меняется.
        <View key={index} collapsable={false} style={{ flex: 1 }}>
          {child}
        </View>
      ))}
    </PagerView>
  );
}
