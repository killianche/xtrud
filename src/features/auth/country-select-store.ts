/**
 * Транзитный (не persisted) канал результата пикера страны
 * (`app/(auth)/country-select.tsx`) обратно в `CountryCodeSelect`-триггер.
 *
 * Тот же handshake, что у `useCategoryFilterPickerStore` /
 * `useOrderDraftStore.selectedLocation`: route-экран коммитит выбранный ISO
 * код страны и делает `router.back()`, триггер слушает store через
 * `useEffect`, применяет и сразу очищает поле — иначе следующее открытие
 * «съест» старый результат.
 */

import { create } from "zustand";

interface CountrySelectState {
  result: { value: string } | null;
  setResult: (code: string | null) => void;
}

export const useCountrySelectStore = create<CountrySelectState>()((set) => ({
  result: null,
  setResult: (code) => set({ result: code === null ? null : { value: code } }),
}));
