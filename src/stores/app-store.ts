import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { SupportedLanguage } from "@/i18n";

export interface AppState {
  currentLocationId: string | null;
  language: SupportedLanguage;
  surgeMode: boolean;
  setCurrentLocationId: (id: string | null) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setSurgeMode: (on: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentLocationId: null,
      language: "en",
      surgeMode: false,
      setCurrentLocationId: (id) => set({ currentLocationId: id }),
      setLanguage: (language) => set({ language }),
      setSurgeMode: (surgeMode) => set({ surgeMode }),
    }),
    {
      name: "fec-os-app",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
    },
  ),
);