// Фильтры экрана «Специалисты» — общий стор списка и шторки /specialists/filters.
// Раньше жили в local state списка; шторке нужен доступ к тем же значениям.
// Сортировки здесь нет: владелец убрал её с экрана 2026-09-10.

import { create } from "zustand";
import type { CityId } from "@/components/CitySelector";

interface SpecialistsFiltersState {
  l1Id: string | null;
  l2Id: string | null;
  cityId: CityId;
  setCategory: (l1Id: string | null, l2Id: string | null) => void;
  setCity: (cityId: CityId) => void;
  clearAll: () => void;
}

export const useSpecialistsFiltersStore = create<SpecialistsFiltersState>((set) => ({
  l1Id: null,
  l2Id: null,
  cityId: "all",
  setCategory: (l1Id, l2Id) => set({ l1Id, l2Id }),
  setCity: (cityId) => set({ cityId }),
  clearAll: () => set({ l1Id: null, l2Id: null, cityId: "all" }),
}));

export function countSpecialistsFilters(s: SpecialistsFiltersState): number {
  let n = 0;
  if (s.l1Id || s.l2Id) n += 1;
  if (s.cityId !== "all") n += 1;
  return n;
}
