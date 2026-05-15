// Zustand store: запоминает активный таб /orders для master-view.
//
// Проблема: мастер открывает таб «Меня выбрали», кликает на заказ,
// возвращается через back → попадает на default-таб «Новые», а не туда
// откуда пришёл (фидбек user 2026-05-15).
//
// Решение: stickyTab сохраняется при тапе на TabPill. При re-mount
// /orders (например, после router.back из /orders/[id]) — читаем
// stickyTab из стора и стартуем с него вместо useState default.

import { create } from "zustand";

export type MasterTab = "new" | "responded" | "assigned";

interface MasterOrdersTabState {
  stickyTab: MasterTab;
  setStickyTab: (tab: MasterTab) => void;
}

export const useMasterOrdersTabStore = create<MasterOrdersTabState>((set) => ({
  stickyTab: "new",
  setStickyTab: (tab) => set({ stickyTab: tab }),
}));
