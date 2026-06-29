"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { createTimer } from "@/lib/performance/timer";

/** Logs `[perf] route-navigation` after pathname change + paint (PERF_LOG=1 or dev). */
export function useNavigationPerf() {
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    const from = prevPath.current;
    prevPath.current = pathname;
    const timer = createTimer("route-navigation", `${from} -> ${pathname}`);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => timer.end());
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pathname]);
}
