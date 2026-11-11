"use client";

import { AsciiReveal } from "ascii-reveal";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type AsciiPageRevealProps = {
  children: ReactNode;
  className?: string;
  /** When false, skip the mount reveal (useful for dense shells that already painted). */
  revealOnMount?: boolean;
};

/**
 * Site-wide ascii-reveal for route content.
 * Persistent wrapper (no pathname remount) so shell chrome stays mounted; navigations
 * scramble via `loading` until `[data-route-loading]` is gone, then decode the page.
 */
export function AsciiPageReveal({
  children,
  className,
  revealOnMount = true,
}: AsciiPageRevealProps) {
  const pathname = usePathname();
  const [navLoading, setNavLoading] = useState(false);
  const pathRef = useRef(pathname);
  const bootRef = useRef(true);

  useEffect(() => {
    if (bootRef.current) {
      bootRef.current = false;
      pathRef.current = pathname;
      return;
    }
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    setNavLoading(true);

    let cancelled = false;
    let seenLoading = false;
    let checks = 0;
    const started = performance.now();

    const check = () => {
      if (cancelled) return;
      checks += 1;
      const pending = document.querySelector("[data-route-loading]");
      if (pending) seenLoading = true;

      const elapsed = performance.now() - started;
      // Brief grace for Suspense to mount `loading.tsx` / `data-route-loading`.
      if (!seenLoading && checks < 3 && elapsed < 96) {
        window.setTimeout(check, 32);
        return;
      }
      // No route-loading marker — clear scramble immediately (don't hold nav for ~250ms).
      if (!seenLoading) {
        setNavLoading(false);
        return;
      }
      // Marker present: wait until gone, but cap so heavy chunks don't feel stuck.
      if (pending && elapsed < 2_500) {
        window.setTimeout(check, 40);
        return;
      }
      setNavLoading(false);
    };

    const t = window.setTimeout(check, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pathname]);

  return (
    <AsciiReveal
      as="div"
      className={cn("ascii-page-reveal min-w-0", className)}
      preset="decode"
      duration="fast"
      origin="top-left"
      lazy
      fallback
      shimmer
      loading={navLoading}
      revealOnMount={revealOnMount}
      revealOnHydrate={false}
    >
      {children}
    </AsciiReveal>
  );
}
