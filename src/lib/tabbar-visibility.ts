/**
 * Глобальный флаг видимости нижнего TabBar.
 *
 * Используется для скрытия TabBar на full-screen wizard'ах (orders/new и т.п.)
 * где он отвлекает. Стандартный `navigation.setOptions({ tabBarStyle })` не
 * работает с нашим custom TabBar — он сам рендерится и не читает options.
 *
 * Использование:
 *   const setHidden = useTabBarVisibility((s) => s.setHidden);
 *   useFocusEffect(useCallback(() => {
 *     setHidden(true);
 *     return () => setHidden(false);
 *   }, [setHidden]));
 */

import { create } from "zustand";

interface TabBarVisibilityState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

export const useTabBarVisibility = create<TabBarVisibilityState>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));
