// Zustand-стор фильтров для глобального поиска заказов /orders/search.
//
// Зачем: фильтры выбираются на отдельном экране /orders/search/filters,
// а применяются на /orders/search. При переходе между экранами state
// нужно сохранять — local useState не подходит. Также удобно для back-nav:
// возврат с filters восстанавливает уже выбранное.

import { create } from "zustand";

export type OrdersSearchSort = "newest" | "urgent";

interface OrdersSearchFiltersState {
  l2Ids: string[];           // выбранные L2 категории
  l1Id: string | null;        // фильтр по L1-разделу (drill-down)
  sort: OrdersSearchSort;
  setL2Ids: (next: string[]) => void;
  toggleL2: (id: string) => void;
  setL1Id: (id: string | null) => void;
  setSort: (s: OrdersSearchSort) => void;
  clearAll: () => void;
}

export const useOrdersSearchFiltersStore = create<OrdersSearchFiltersState>((set, get) => ({
  l2Ids: [],
  l1Id: null,
  sort: "newest",
  setL2Ids: (next) => set({ l2Ids: next }),
  toggleL2: (id) => {
    const cur = new Set(get().l2Ids);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    set({ l2Ids: Array.from(cur) });
  },
  setL1Id: (id) => set({ l1Id: id }),
  setSort: (s) => set({ sort: s }),
  clearAll: () => set({ l2Ids: [], l1Id: null, sort: "newest" }),
}));

/** Helper: подсчёт активных фильтров для бейджа на кнопке «Фильтры». */
export function countActiveFilters(state: OrdersSearchFiltersState): number {
  let n = 0;
  if (state.l2Ids.length > 0) n += state.l2Ids.length;
  // L1 как самостоятельный фильтр считается +1, только если без L2
  // (иначе L2 уже сужают выдачу и L1 — лишь способ группировки).
  else if (state.l1Id != null) n += 1;
  if (state.sort !== "newest") n += 1;
  return n;
}
