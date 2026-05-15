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
 * Решение. Отдельный Zustand-стек, который пушится на каждое изменение
 * `usePathname()`. useSafeBack читает стек, popит верхнюю запись (текущая)
 * и навигирует на предпоследнюю — это и есть «откуда я пришёл».
 *
 * Подписка происходит в корневом `app/_layout.tsx` через `<NavHistoryTracker />`.
 *
 * Ограничения:
 * - дедупликация смежных одинаковых записей (повторный рендер на той же
 *   странице не плодит stack);
 * - cap на 50 записей, чтобы стек не рос бесконечно при долгих сессиях;
 * - history-tracker должен быть смонтирован один раз; useSafeBack ниже него
 *   в дереве может рассчитывать что stack актуален.
 */

import { usePathname } from "expo-router";
import { useEffect } from "react";
import { create } from "zustand";

interface NavHistoryState {
  stack: string[];
  push: (path: string) => void;
  /** Снимает top (текущий) и возвращает новый top (предыдущий). undefined если стек был ≤1. */
  goBack: () => string | undefined;
}

const MAX_STACK = 50;

export const useNavHistory = create<NavHistoryState>((set, get) => ({
  stack: [],
  push: (path) =>
    set((s) => {
      const top = s.stack[s.stack.length - 1];
      if (top === path) return s;
      const next = [...s.stack, path];
      // cap
      if (next.length > MAX_STACK) next.splice(0, next.length - MAX_STACK);
      return { stack: next };
    }),
  goBack: () => {
    const s = get();
    if (s.stack.length < 2) return undefined;
    // Снимаем текущий и предыдущий: предыдущий вернёт push() обратно после navigate.
    const next = s.stack.slice(0, -2);
    const prev = s.stack[s.stack.length - 2];
    set({ stack: next });
    return prev;
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
