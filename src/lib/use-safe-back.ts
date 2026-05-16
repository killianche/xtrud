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

/** Извлекает namespace-сегмент из expo-router пути:
 *  "/(tabs)/chats" → "chats", "/orders/abc" → "orders", "/chats/xyz" → "chats". */
function tabSegment(path: string): string | null {
  const cleaned = path.replace(/^\/\(tabs\)\//, "/").replace(/^\//, "");
  const seg = cleaned.split("/")[0];
  return seg || null;
}

/** Сегментов в пути (без /(tabs)/ и без query). Detail-страницы имеют ≥2
 *  (например, /chats/abc, /orders/xyz). Tab-корни — 1 (/profile, /chats). */
function segmentsCount(path: string): number {
  const cleaned = path.replace(/^\/\(tabs\)\//, "/").replace(/^\//, "").split("?")[0];
  if (!cleaned) return 0;
  return cleaned.split("/").filter(Boolean).length;
}

export function useSafeBack(fallback: Href) {
  const router = useRouter();
  const goBackInStack = useNavHistory((s) => s.goBack);
  return useCallback(() => {
    const prev = goBackInStack();
    if (prev) {
      // Detail-страница (≥2 сегмента: /chats/abc, /orders/xyz) — это
      // «реальный экран откуда пришёл», возвращаемся всегда, независимо от
      // таба. Без этого back из /orders/[id] (после chat → order) уводил в
      // корень orders-таба → у клиента это main-страница (фидбэк user
      // 2026-05-16). С этим — возвращаемся в /chats/abc.
      if (segmentsCount(prev) >= 2) {
        router.replace(prev as Href);
        return;
      }
      // prev — tab-корень (/profile, /chats). Если его таб совпадает с
      // fallback — используем его. Если другой (profile vs chats) —
      // приоритет у fallback, чтобы не «прыгало» между табами.
      const prevSeg = tabSegment(prev);
      const fbSeg = typeof fallback === "string" ? tabSegment(fallback) : null;
      if (!fbSeg || prevSeg === fbSeg) {
        router.replace(prev as Href);
        return;
      }
    }
    router.replace(fallback);
  }, [router, fallback, goBackInStack]);
}
