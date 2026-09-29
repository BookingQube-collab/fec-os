"use client";

import Aurora from "@/components/react-bits/aurora";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const FEC_STOPS = ["#fff6d4", "#f5c518", "#ffe7a3"];

/** Official Aurora, held back when the user prefers reduced motion. */
export function AuroraBackdrop({
  className,
  amplitude = 0.42,
  blend = 0.38,
  speed = 0.42,
}: {
  className?: string;
  amplitude?: number;
  blend?: number;
  speed?: number;
}) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;

  return (
    <div className={cn("pointer-events-none", className)} aria-hidden>
      <Aurora colorStops={FEC_STOPS} amplitude={amplitude} blend={blend} speed={speed} lightMode />
    </div>
  );
}
