import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { SupportedLanguage } from "@/i18n";

export interface AppState {
  currentLocationId: string | null;
  language: SupportedLanguage;
  surgeMode: boolean;
  sidebarExpanded: boolean;
  setCurrentLocationId: (id: string | null) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setSurgeMode: (on: boolean) => void;
  setSidebarExpanded: (on: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentLocationId: null,
      language: "en",
      surgeMode: false,
      sidebarExpanded: false,
      setCurrentLocationId: (id) => set({ currentLocationId: id }),
      setLanguage: (language) => set({ language }),
      setSurgeMode: (surgeMode) => set({ surgeMode }),
      setSidebarExpanded: (sidebarExpanded) => set({ sidebarExpanded }),
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