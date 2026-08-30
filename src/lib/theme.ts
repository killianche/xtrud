// Zustand store для пользовательского предпочтения темы.
//
// Источник истины — preference: 'system' | 'light' | 'dark'.
// Резолв в 'light'|'dark' делает useColorScheme hook через NativeWind.
//
// Персистентность через storage.ts (SecureStore на native, localStorage на web).

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { storage } from "./storage";

export type ThemePreference = "system" | "light" | "dark";

export interface ThemeState {
  preference: ThemePreference;
  /** True после первой гидрации из persistent storage — UI ждёт этого перед рендером темы. */
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "system",
      hydrated: false,
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: "xtrud-theme",
      version: 1,
      storage: createJSONStorage(() => storage),
      onRehydrateStorage: () => (state) => {
        // Помечаем, что гидратация прошла (даже если storage пустой).
        if (state) state.hydrated = true;
      },
      partialize: (state) => ({ preference: state.preference }),
    },
  ),
);
