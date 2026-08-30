/**
 * Транзитный (не persisted) канал результата пикера даты
 * (`app/(details)/orders/date-select.tsx`) обратно в `OrderFormBody`.
 *
 * Тот же handshake, что у `useCategoryFilterPickerStore` /
 * `useOrderDraftStore.selectedLocation`: route-экран коммитит выбранную дату
 * (yyyy-mm-dd) по тапу «Готово» и делает `router.back()`, `OrderFormBody`
 * слушает store через `useEffect`, применяет (`setPreferredDate` + urgency
 * "by_date") и сразу очищает поле.
 */

import { create } from "zustand";

interface OrderDatePickerState {
  result: { value: string } | null;
  setResult: (isoDate: string | null) => void;
}

export const useOrderDatePickerStore = create<OrderDatePickerState>()((set) => ({
  result: null,
  setResult: (isoDate) => set({ result: isoDate === null ? null : { value: isoDate } }),
}));
