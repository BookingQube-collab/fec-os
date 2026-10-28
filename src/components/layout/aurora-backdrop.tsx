"use client";

import dynamic from "next/dynamic";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/** WebGL (ogl) stays out of the shell chunk. The backdrop paints after the chunk arrives. */
const Aurora = dynamic(() => import("@/components/react-bits/aurora"), { ssr: false });

const FEC_STOPS = ["#efeaff", "#6d4aff", "#ddd4ff"];

/**
 * Official Aurora. Parent shell already gates preference + heavy routes;
 * reduced motion is a final safety net (e.g. auth page).
 */
export function AuroraBackdrop({
  className,
  amplitude = 0.42,
  blend = 0.38,
  speed = 0.42,
  enabled = true,
}: {
  className?: string;
  amplitude?: number;
  blend?: number;
  speed?: number;
  enabled?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  if (!enabled || reduced) return null;

  return (
    <div className={cn("pointer-events-none", className)} aria-hidden>
      <Aurora colorStops={FEC_STOPS} amplitude={amplitude} blend={blend} speed={speed} lightMode />
    </div>
  );
}
