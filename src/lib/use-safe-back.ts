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
 * Решение. Внутри настоящего Stack используем его native pop — так кнопка и
 * iOS edge-swipe имеют одну историю и одну анимацию. Отдельный in-app стек
 * путей (`@/lib/nav-history`) остаётся fallback'ом только для переходов между
 * navigator'ами, где native Stack не владеет предыдущим экраном.
 *
 * Приоритет:
 *   1. Текущий navigator — Stack и может вернуться → native goBack().
 *   2. nav-history имеет запись «откуда» → router.replace(prev) на неё.
 *   3. Нет (deeplink / refresh) → router.replace(fallback).
 *
 * Фидбэк user 2026-05-15: «Мои заказы → заказ → мастер → "назад" уводит
 * куда попало». Без nav-history стек пуст после reload и back уходил
 * либо на home (через router.replace fallback при пустом stack), либо
 * на /orders (через history.back), но НЕ на /orders/[id].
 *
 * NB: fallback типизирован Href из expo-router. На стороне вызова
 *     рекомендуется `as const`, чтобы TS проверил route.
 */

import { type Href, useNavigation, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { mayPopLocalStack } from "./nav-back-policy";
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
  const cleaned = path
    .replace(/^\/\(tabs\)\//, "/")
    .replace(/^\//, "")
    .split("?")[0];
  if (!cleaned) return 0;
  return cleaned.split("/").filter(Boolean).length;
}

export function useSafeBack(fallback: Href) {
  const router = useRouter();
  const navigation = useNavigation();
  const rootNavigation = useNavigation("/");
  const goBackInStack = useNavHistory((s) => s.goBack);
  const transitionLocked = useRef(false);
  return useCallback(() => {
    if (transitionLocked.current) return;
    transitionLocked.current = true;

    const localState = navigation.getState();
    const rootState = rootNavigation.getState();
    const localIsRoot = !!localState?.key && localState.key === rootState?.key;
    const hasTrackedCaller = useNavHistory.getState().stack.length >= 2;
    const localCanPop =
      localState?.type === "stack" &&
      localState.index > 0 &&
      navigation.canGoBack() &&
      mayPopLocalStack({ localIsRoot, hasTrackedCaller });
    const rootCanPop =
      !localIsRoot &&
      rootState?.type === "stack" &&
      rootState.index > 0 &&
      rootNavigation.canGoBack() &&
      hasTrackedCaller;
    const nativeOwner = localCanPop ? navigation : rootCanPop ? rootNavigation : null;
    const nativeState = localCanPop ? localState : rootCanPop ? rootState : undefined;
    const observedState = nativeState ?? localState;
    const routeBefore = observedState?.routes[observedState.index]?.key;
    const unlockIfNavigationWasPrevented = (owner = navigation) => {
      requestAnimationFrame(() => {
        const stateAfter = owner.getState();
        const routeAfter = stateAfter?.routes[stateAfter.index]?.key;
        if (routeAfter === routeBefore) transitionLocked.current = false;
      });
    };

    // A real Stack owns its history and its iOS interactive transition.
    // Pop it instead of replacing the current route (which used to leave a
    // duplicate screen underneath and animate Back as a forward push).
    // `canGoBack()` alone may be true because a parent Tab/Stack can move.
    // Require a locally poppable Stack so Back never escapes to a wrong tab.
    if (nativeOwner) {
      nativeOwner.goBack();
      unlockIfNavigationWasPrevented(nativeOwner);
      return;
    }

    const prev = goBackInStack();
    if (prev) {
      // Detail-страница (≥2 сегмента: /chats/abc, /orders/xyz) — это
      // «реальный экран откуда пришёл», возвращаемся всегда, независимо от
      // таба. Без этого back из /orders/[id] (после chat → order) уводил в
      // корень orders-таба → у клиента это main-страница (фидбэк user
      // 2026-05-16). С этим — возвращаемся в /chats/abc.
      if (segmentsCount(prev) >= 2) {
        router.replace(prev as Href);
        unlockIfNavigationWasPrevented();
        return;
      }
      // prev — tab-корень (/profile, /chats). Если его таб совпадает с
      // fallback — используем его. Если другой (profile vs chats) —
      // приоритет у fallback, чтобы не «прыгало» между табами.
      const prevSeg = tabSegment(prev);
      const fbSeg = typeof fallback === "string" ? tabSegment(fallback) : null;
      if (!fbSeg || prevSeg === fbSeg) {
        router.replace(prev as Href);
        unlockIfNavigationWasPrevented();
        return;
      }
    }
    router.replace(fallback);
    unlockIfNavigationWasPrevented();
  }, [router, navigation, rootNavigation, fallback, goBackInStack]);
}
