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
  /** Timestamp последнего push — для intermediate-redirect debounce.
   *  Если новый push приходит < INTERMEDIATE_MS после предыдущего, считаем
   *  что это transient pathname во время router.push (например, мастер
   *  пушит `/(tabs)/orders/[id]` → expo-router проходит через
   *  `/(tabs)/orders/index` который содержит `<Redirect href="/(tabs)" />`
   *  → потом `/(tabs)/orders/[id]`). usePathname ловит intermediate path и
   *  без debounce'а он попадает в stack — потом goBack возвращает туда. */
  lastPushAt: number;
  push: (path: string) => void;
  /** Снимает top (текущий) и возвращает новый top (предыдущий). undefined если стек был ≤1. */
  goBack: () => string | undefined;
}

const MAX_STACK = 50;
const INTERMEDIATE_MS = 150;

export const useNavHistory = create<NavHistoryState>((set, get) => ({
  stack: [],
  lastPushAt: 0,
  push: (path) =>
    set((s) => {
      const top = s.stack[s.stack.length - 1];
      if (top === path) return s;
      const now = Date.now();
      // Intermediate redirect: pathname меняется внутри одного router.push.
      // Заменяем последнюю entry вместо append, чтобы в стек попадал только
      // финальный path (а не цепочка transient redirect-ов).
      if (now - s.lastPushAt < INTERMEDIATE_MS && s.stack.length > 0) {
        const next = [...s.stack.slice(0, -1), path];
        return { stack: next, lastPushAt: now };
      }
      const next = [...s.stack, path];
      // cap
      if (next.length > MAX_STACK) next.splice(0, next.length - MAX_STACK);
      return { stack: next, lastPushAt: now };
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
