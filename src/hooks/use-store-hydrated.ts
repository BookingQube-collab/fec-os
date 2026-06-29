"use client";

import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/app-store";

/** True once Zustand persist has rehydrated from localStorage (avoids duplicate queries on hydration). */
export function useStoreHydrated() {
  const [hydrated, setHydrated] = useState(() =>
    typeof window === "undefined" ? false : useAppStore.persist.hasHydrated(),
  );

  useEffect(() => {
    setHydrated(useAppStore.persist.hasHydrated());
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
