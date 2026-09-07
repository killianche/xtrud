// Фильтры экрана «Специалисты» — общий стор списка и шторки /specialists/filters.
// Раньше жили в local state списка; шторке нужен доступ к тем же значениям.

import { create } from "zustand";
import type { CityId } from "@/components/CitySelector";
import type { MasterSort } from "@/features/master-view/use-search-masters";

export const SORT_LABEL: Record<MasterSort, string> = {
  rating: "По рейтингу",
  experience: "По опыту",
  availability: "Сначала свободные",
};

interface SpecialistsFiltersState {
  l1Id: string | null;
  l2Id: string | null;
  cityId: CityId;
  sort: MasterSort;
  setCategory: (l1Id: string | null, l2Id: string | null) => void;
  setCity: (cityId: CityId) => void;
  setSort: (sort: MasterSort) => void;
  clearAll: () => void;
}

export const useSpecialistsFiltersStore = create<SpecialistsFiltersState>((set) => ({
  l1Id: null,
  l2Id: null,
  cityId: "all",
  sort: "rating",
  setCategory: (l1Id, l2Id) => set({ l1Id, l2Id }),
  setCity: (cityId) => set({ cityId }),
  setSort: (sort) => set({ sort }),
  clearAll: () => set({ l1Id: null, l2Id: null, cityId: "all", sort: "rating" }),
}));

export function countSpecialistsFilters(s: SpecialistsFiltersState): number {
  let n = 0;
  if (s.l1Id || s.l2Id) n += 1;
  if (s.cityId !== "all") n += 1;
  if (s.sort !== "rating") n += 1;
  return n;
}
