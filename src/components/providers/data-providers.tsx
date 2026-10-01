"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { SiteRow } from "@/lib/queries/module-queries.core";

/** Idle prefetch for shared site list — does not block shell render. */
export function SitesPrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const schedule = () => {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.sites.list(),
        queryFn: () => apiGet<SiteRow[]>("/api/sites", undefined, { cache: "no-store" }),
        staleTime: 60_000,
      });
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(schedule, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(schedule, 100);
    return () => window.clearTimeout(id);
  }, [queryClient]);

  return null;
}
