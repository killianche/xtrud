/**
 * Tab scroll-to-top pattern — стандартное поведение мобильных табов:
 * тап на УЖЕ активный таб скроллит верхний контент к началу.
 *
 * Реализация: Zustand store со счётчиком для каждого tab-роута. TabBar
 * увеличивает счётчик при тапе на focused-таб; экран этого таба подписан
 * на свой счётчик через `useTabScrollResetCounter(routeName)` и в useEffect
 * вызывает `scrollRef.current?.scrollTo({ y: 0, animated: true })`.
 *
 * Pattern: increment-based вместо boolean-flag — не нужно сбрасывать
 * после каждого reset'а, useEffect срабатывает на каждое изменение значения.
 *
 * Использование в экране:
 *
 *   const scrollRef = useRef<ScrollView>(null);
 *   const resetCounter = useTabScrollResetCounter("index");
 *   useEffect(() => {
 *     if (resetCounter > 0) {
 *       scrollRef.current?.scrollTo({ y: 0, animated: true });
 *     }
 *   }, [resetCounter]);
 *
 *   <ScrollView ref={scrollRef}>...</ScrollView>
 *
 * Если экран использует FlatList / FlashList — `scrollToOffset({ offset: 0 })`.
 */

import type { RefObject } from "react";
import type { FlatList, ScrollView } from "react-native";
import { create } from "zustand";

/** Универсальный scroll-to-top helper для ScrollView/FlatList ref'ов.
 *  Работает и на native (RN ScrollView.scrollTo / FlatList.scrollToOffset),
 *  и на web (RN-Web `getScrollableNode()` → DOM Element.scrollTo с smooth-behavior).
 *
 *  На react-native-web ref.current.scrollTo() **не** делегирует в DOM —
 *  это известная разница. Нужен путь через underlying DOM element. */
export function scrollViewToTop(
  ref: RefObject<ScrollView | null> | RefObject<FlatList | null>,
): void {
  const node = ref.current as unknown as {
    scrollTo?: (opts: { y?: number; x?: number; animated?: boolean }) => void;
    scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
    getScrollableNode?: () => unknown;
  } | null;
  if (!node) return;

  // Native FlatList path
  if (typeof node.scrollToOffset === "function") {
    try {
      node.scrollToOffset({ offset: 0, animated: true });
    } catch {
      /* ignore */
    }
  }

  // Native ScrollView path
  if (typeof node.scrollTo === "function") {
    try {
      node.scrollTo({ y: 0, animated: true });
    } catch {
      /* ignore */
    }
  }

  // RN-Web path — добраться до underlying div и сбросить scrollTop напрямую.
  // ВАЖНО: `dom.scrollTo({top:0})` не работает на react-native-web ScrollView
  // (RN перехватывает scroll-events). Только прямое присваивание `scrollTop = 0`
  // гарантированно работает. Анимации не делаем — стандарт mobile-pattern
  // «tap on active tab» — instant scroll-to-top.
  if (typeof node.getScrollableNode === "function") {
    const dom = node.getScrollableNode() as { scrollTop?: number } | null;
    if (dom && "scrollTop" in dom) {
      dom.scrollTop = 0;
    }
  }
}

interface TabScrollResetState {
  /** Per-tab counter. Каждый тап на focused tab → +1 для его route-name. */
  counters: Record<string, number>;
  /** Вызвать reset для конкретного tab-роута. */
  trigger: (tabName: string) => void;
}

export const useTabScrollReset = create<TabScrollResetState>((set) => ({
  counters: {},
  trigger: (tabName) =>
    set((state) => ({
      counters: {
        ...state.counters,
        [tabName]: (state.counters[tabName] ?? 0) + 1,
      },
    })),
}));

/** Хук для экрана-владельца таба. Возвращает текущий счётчик — экран
 *  слушает изменения через useEffect и скроллит к началу. */
export function useTabScrollResetCounter(tabName: string): number {
  return useTabScrollReset((s) => s.counters[tabName] ?? 0);
}

/** Имперэтив для TabBar onPress — без подписки на store. */
export function triggerTabScrollReset(tabName: string): void {
  useTabScrollReset.getState().trigger(tabName);
}
