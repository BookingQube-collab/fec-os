"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parsePeopleEventId } from "@/lib/people-event-selection";

/**
 * Shared selected event across People Events workforce routes.
 * Source of truth: URL search param `eventId` (refresh/shareable).
 */
export function usePeopleEventSelection() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  const eventId = parsePeopleEventId(searchParams.get("eventId"));

  const setEventId = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const id = parsePeopleEventId(next);
      if (id) params.set("eventId", id);
      else params.delete("eventId");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { eventId, setEventId };
}
