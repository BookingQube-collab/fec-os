"use client";

import { useSyncExternalStore } from "react";

import {
  getEnglishCatalogServerSnapshot,
  getEnglishCatalogSnapshot,
  subscribeEnglishCatalog,
} from "@/i18n";

export function useEnglishCatalog() {
  return useSyncExternalStore(
    subscribeEnglishCatalog,
    getEnglishCatalogSnapshot,
    getEnglishCatalogServerSnapshot,
  );
}
