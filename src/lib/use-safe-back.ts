/**
 * useSafeBack — back-навигация с гарантированным fallback'ом.
 *
 * Проблема. `router.back()` в Expo Router работает по стеку React Navigation
 * текущего навигатора. На вебе detail-экраны (master/[id], client/[id],
 * category/[id], chats/[id], orders/[id], notifications, useful, admin,
 * search, profile) живут как top-level Tabs.Screen внутри (tabs).
 * Переход `orders/[id] → master/[id]` НЕ пушит в стек orders, а переключает
 * «таб». Стек master-таба одиночный, `router.canGoBack()` возвращает true
 * через tab navigator и `router.back()` уводит на корень предыдущего таба,
 * НЕ туда, откуда пользователь реально пришёл.
 *
 * Browser history тоже не помогает: Expo Router при cross-tab переходе
 * делает `history.replaceState`, не `pushState`. Поэтому browser-history
 * предыдущий entry — это уже /orders (список), а не /orders/[id].
 *
 * Решение. Отдельный in-app стек путей (`@/lib/nav-history`) пушится на
 * каждое изменение `usePathname()`. useSafeBack берёт предпоследний путь
 * из стека и делает `router.replace(prev)` — это «откуда я пришёл»
 * независимо от того, какой механизм истории использует expo-router внутри.
 *
 * Приоритет:
 *   1. nav-history имеет запись «откуда» → router.replace(prev) на неё.
 *   2. Нет (deeplink / refresh) → router.replace(fallback).
 *
 * Фидбэк user 2026-05-15: «Мои заказы → заказ → мастер → "назад" уводит
 * куда попало». Без nav-history стек пуст после reload и back уходил
 * либо на home (через router.replace fallback при пустом stack), либо
 * на /orders (через history.back), но НЕ на /orders/[id].
 *
 * NB: fallback типизирован Href из expo-router. На стороне вызова
 *     рекомендуется `as const`, чтобы TS проверил route.
 */

import { type Href, useRouter } from "expo-router";
import { useCallback } from "react";
import { useNavHistory } from "./nav-history";

export function useSafeBack(fallback: Href) {
  const router = useRouter();
  const goBackInStack = useNavHistory((s) => s.goBack);
  return useCallback(() => {
    const prev = goBackInStack();
    if (prev) {
      router.replace(prev as Href);
      return;
    }
    router.replace(fallback);
  }, [router, fallback, goBackInStack]);
}
