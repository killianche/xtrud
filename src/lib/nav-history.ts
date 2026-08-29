/**
 * nav-history — in-app трекер навигационной истории.
 *
 * Зачем. Expo Router на вебе с (tabs) Tab-навигатором использует
 * `history.replaceState` при cross-tab переходах. Это значит:
 * `/orders/[id] → /master/[id]` НЕ добавляет browser-history entry, а
 * затирает текущий. Поэтому ни `router.back()` (он смотрит React
 * Navigation stack текущего таба и уходит на корень таба), ни
 * `window.history.back()` (предыдущий entry — уже /orders, а не
 * /orders/[id]) не возвращают пользователя «туда, откуда я пришёл».
 *
 * Решение. Отдельный Zustand-стек зеркалит изменения `usePathname()`.
 * Настоящий native Stack остаётся главным владельцем back-навигации, а этот
 * стек используется как fallback между navigator'ами. Если pathname снова
 * стал предпоследней записью, policy распознаёт native pop и снимает top,
 * вместо того чтобы загрязнять историю последовательностью [A, B, A].
 *
 * Подписка происходит в корневом `app/_layout.tsx` через `<NavHistoryTracker />`.
 *
 * Ограничения:
 * - дедупликация смежных одинаковых записей (повторный рендер на той же
 *   странице не плодит stack);
 * - возврат на непосредственно предыдущий path трактуется как pop;
 * - cap на 50 записей, чтобы стек не рос бесконечно при долгих сессиях;
 * - history-tracker должен быть смонтирован один раз; useSafeBack ниже него
 *   в дереве может рассчитывать что stack актуален.
 */

import { usePathname } from "expo-router";
import { useEffect } from "react";
import { create } from "zustand";
import { popNavPath, recordNavPath } from "./nav-history-policy";

interface NavHistoryState {
  stack: string[];
  push: (path: string) => void;
  /** Снимает top (текущий) и возвращает новый top (предыдущий). undefined если стек был ≤1. */
  goBack: () => string | undefined;
}

export const useNavHistory = create<NavHistoryState>((set, get) => ({
  stack: [],
  push: (path) => set((s) => ({ stack: recordNavPath(s.stack, path) })),
  goBack: () => {
    const result = popNavPath(get().stack);
    if (!result.previous) return undefined;
    set({ stack: result.stack });
    return result.previous;
  },
}));

/**
 * Компонент-наблюдатель. Монтируется в корне (app/_layout.tsx).
 * Подписывается на `usePathname()` и пушит каждое изменение в стек.
 */
export function NavHistoryTracker(): null {
  const pathname = usePathname();
  const push = useNavHistory((s) => s.push);
  useEffect(() => {
    if (pathname) push(pathname);
  }, [pathname, push]);
  return null;
}
