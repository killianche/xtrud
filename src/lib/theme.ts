// Zustand store для пользовательского предпочтения темы.
//
// Источник истины — preference: 'system' | 'light' | 'dark'.
// Резолв в 'light'|'dark' делает useColorScheme hook через NativeWind.
//
// В sprint 1.2 без персистентности (in-memory). Персистентность через storage.ts
// добавляется в sprint 1.6 одновременно с Supabase auth.

import { create } from "zustand";

export type ThemePreference = "system" | "light" | "dark";

export interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: "system",
  setPreference: (preference) => set({ preference }),
}));
