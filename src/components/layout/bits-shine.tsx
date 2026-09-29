"use client";

import ShinyText from "@/components/react-bits/shiny-text";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/** Shared FEC colors for the official React Bits Shiny Text treatment. */
export function BitsShine({
  text,
  className,
  color = "#1a1a1a",
  shineColor = "#c47a0a",
  speed = 4.8,
}: {
  text: string;
  className?: string;
  color?: string;
  shineColor?: string;
  speed?: number;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <ShinyText
      text={text}
      disabled={reduced}
      speed={speed}
      delay={1.4}
      spread={112}
      color={color}
      shineColor={shineColor}
      className={cn("max-w-full", className)}
    />
  );
}
