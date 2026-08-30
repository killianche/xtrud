/**
 * Транзитный (не persisted) канал результата фильтр-пикеров экрана категории
 * (`app/(details)/category/[id].tsx`).
 *
 * Триггеры фильтров (сортировка / город / услуга) открывают отдельный
 * route-экран (`sort-select` / `city-select` / `l3-select`) с нативной
 * `formSheet`-модальностью вместо самописного `BottomSheet` — см.
 * `docs/IOS_FOUNDATION.md` §2.4. Текущее значение уходит в route через
 * `router.push` params, а выбор возвращается назад через этот store: экран
 * пикера коммитит результат и делает `router.back()`, экран категории слушает
 * store через `useEffect` (паттерн 1-в-1 с `useOrderDraftStore.selectedLocation`
 * / `src/features/orders/LocationPicker.tsx`) и применяет его в свой local
 * state, затем очищает поле — иначе повторное открытие того же пикера сразу
 * «съест» старый результат.
 *
 * Обёртка `{ value } | null` (а не голое nullable-значение) нужна, чтобы
 * отличить «пикер ещё не закоммитил результат» (null) от «пользователь явно
 * выбрал falsy-значение» (например, сброс услуги в «Все услуги» = `{ value:
 * null }`).
 */

import { create } from "zustand";
import type { CityId } from "@/components/CitySelector";

export type CategorySortBy = "rating" | "experience" | "availability";

interface CategoryFilterPickerState {
  sortResult: { value: CategorySortBy } | null;
  setSortResult: (value: CategorySortBy | null) => void;

  cityResult: { value: CityId } | null;
  setCityResult: (value: CityId | null) => void;

  /** `value: null` — пользователь выбрал «Все услуги» (сброс L3-фильтра). */
  l3Result: { value: string | null } | null;
  setL3Result: (value: string | null) => void;
}

export const useCategoryFilterPickerStore = create<CategoryFilterPickerState>()((set) => ({
  sortResult: null,
  setSortResult: (value) => set({ sortResult: value === null ? null : { value } }),

  cityResult: null,
  setCityResult: (value) => set({ cityResult: value === null ? null : { value } }),

  l3Result: null,
  setL3Result: (value) => set({ l3Result: { value } }),
}));
