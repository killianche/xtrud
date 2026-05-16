// Zustand-стор фильтров для глобального поиска заказов /orders/search.
//
// Зачем: фильтры выбираются на отдельном экране /orders/search/filters,
// а применяются на /orders/search. При переходе между экранами state
// нужно сохранять — local useState не подходит. Также удобно для back-nav:
// возврат с filters восстанавливает уже выбранное.
//
// **2026-05-15 — поле `l1Id` удалено** (фидбэк user: «убери разделы, у нас
// есть категории, этого достаточно»). Раньше был отдельный фильтр по L1
// (Строительство и ремонт / Дом и быт), но он избыточен — пользователь
// фильтрует напрямую по L2 (Сантехника, Электрика и т.д.). L1 остаётся
// в БД как организационная группа, но не показывается в UI как фильтр.
//
// **2026-05-15 — defaults из master_categories.** При первом заходе мастера
// на /orders/search его l2Ids подставляются автоматически из категорий
// профиля (master_categories) — он сразу видит релевантные заявки, не
// нужно вручную выбирать фильтры. Триггер — `initFromMasterCategories(userId, ids)`.
// Реинициализация защищена `initializedForUserId`: если юзер очистил
// фильтры — повторно не перезаливаем, чтобы можно было увидеть «все категории».
// Смена юзера (logout/login другой) → `initializedForUserId` не совпадает →
// дефолты подставятся заново.

import { create } from "zustand";

export type OrdersSearchSort = "newest" | "urgent";

interface OrdersSearchFiltersState {
  l2Ids: string[]; // выбранные L2 категории
  sort: OrdersSearchSort;
  /**
   * userId, для которого l2Ids уже были инициализированы из master_categories.
   * null = ни разу не подставляли defaults в этой сессии (или logout).
   */
  initializedForUserId: string | null;
  setL2Ids: (next: string[]) => void;
  toggleL2: (id: string) => void;
  setSort: (s: OrdersSearchSort) => void;
  clearAll: () => void;
  /**
   * Подставить defaults из master_categories при первом заходе пользователя
   * на /orders/search. Идемпотентна — повторный вызов с тем же userId no-op.
   * Вызывать когда useMyMasterCategories отдал данные (даже пустой массив —
   * это валидное состояние «у мастера нет категорий», тоже считаем как
   * initialized чтобы не дёргать на каждом mount).
   */
  initFromMasterCategories: (userId: string, masterL2Ids: string[]) => void;
}

export const useOrdersSearchFiltersStore = create<OrdersSearchFiltersState>((set, get) => ({
  l2Ids: [],
  sort: "newest",
  initializedForUserId: null,
  setL2Ids: (next) => set({ l2Ids: next }),
  toggleL2: (id) => {
    const cur = new Set(get().l2Ids);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    set({ l2Ids: Array.from(cur) });
  },
  setSort: (s) => set({ sort: s }),
  clearAll: () => set({ l2Ids: [], sort: "newest" }),
  initFromMasterCategories: (userId, masterL2Ids) => {
    if (get().initializedForUserId === userId) return;
    set({
      l2Ids: masterL2Ids.slice(),
      initializedForUserId: userId,
    });
  },
}));

/** Helper: подсчёт активных фильтров для бейджа на кнопке «Фильтры». */
export function countActiveFilters(state: OrdersSearchFiltersState): number {
  let n = 0;
  if (state.l2Ids.length > 0) n += state.l2Ids.length;
  if (state.sort !== "newest") n += 1;
  return n;
}
