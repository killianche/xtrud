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
// По умолчанию фильтры пустые: вход всегда показывает все задания. Категории
// профиля доступны только как явные quick-select chips на экране фильтров.

import { create } from "zustand";

interface OrdersSearchFiltersState {
  l2Ids: string[]; // выбранные L2 категории
  /**
   * Фильтр по локации. cityId="" и district="" = «Вся Ингушетия» (без фильтра).
   * Иначе выбран ЛИБО город (cityId), ЛИБО район (district) — взаимоисключающе
   * (выбор одного сбрасывает другой через setLocation). Выбирается на экране
   * /orders/search/location-select, применяется в ленте /orders/search.
   */
  cityId: string;
  district: string;
  setL2Ids: (next: string[]) => void;
  toggleL2: (id: string) => void;
  /** Выставить локацию-фильтр. cityId+district взаимоисключающие — передавай
   *  один непустой, второй "". Оба "" = снять фильтр («Вся Ингушетия»). */
  setLocation: (cityId: string, district: string) => void;
  clearAll: () => void;
}

export const useOrdersSearchFiltersStore = create<OrdersSearchFiltersState>((set, get) => ({
  l2Ids: [],
  cityId: "",
  district: "",
  setL2Ids: (next) => set({ l2Ids: next }),
  toggleL2: (id) => {
    const cur = new Set(get().l2Ids);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    set({ l2Ids: Array.from(cur) });
  },
  setLocation: (cityId, district) => set({ cityId, district }),
  clearAll: () => set({ l2Ids: [], cityId: "", district: "" }),
}));

/** Helper: подсчёт активных фильтров для бейджа на кнопке «Фильтры». */
export function countActiveFilters(state: OrdersSearchFiltersState): number {
  let n = 0;
  if (state.l2Ids.length > 0) n += state.l2Ids.length;
  // Локация (город ИЛИ район) — один активный фильтр.
  if (state.cityId || state.district) n += 1;
  return n;
}
