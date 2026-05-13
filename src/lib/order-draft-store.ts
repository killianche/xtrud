/**
 * Order draft store — временное хранилище выбора между sub-экранами wizard'а
 * заказа. Используется чтобы передать выбранную категорию из
 * `/orders/category-select` обратно в `/orders/new` (Expo Router не
 * поддерживает return-params после router.back()).
 *
 * После того как CategoryPicker прочитал selectedL2 и записал в react-hook-form,
 * флаг сбрасывается вызовом setSelectedL2(null).
 */

import { create } from "zustand";

interface OrderDraftState {
  /** id выбранной L2 категории — устанавливается с экрана выбора, обнуляется
   *  после применения в форме. */
  selectedL2: string | null;
  setSelectedL2: (id: string | null) => void;
}

export const useOrderDraftStore = create<OrderDraftState>((set) => ({
  selectedL2: null,
  setSelectedL2: (id) => set({ selectedL2: id }),
}));
