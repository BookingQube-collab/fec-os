"use client";

/**
 * Official React Bits StarBorder-TS-TW (https://reactbits.dev/r/StarBorder-TS-TW.json).
 * The registry build is a black button with fixed padding, so it is not wrapped
 * around inputs. Fields use the same sweep via `.fec-star-border` on the control.
 * This copy keeps the CSS stars for a small chrome-free frame (empty-state icon).
 * Reduced motion renders children only — nothing is held at opacity 0.
 */
import React from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

type StarBorderProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
  color?: string;
  speed?: string;
  thickness?: number;
};

export default function StarBorder({
  as,
  className,
  color = "#c47a0a",
  speed = "6s",
  thickness = 3,
  children,
  style,
  ...rest
}: StarBorderProps) {
  const Component = as ?? "span";
  const reduced = usePrefersReducedMotion();

  return (
    <Component
      className={cn("relative inline-block overflow-hidden rounded-full align-middle", className)}
      {...rest}
      style={{ padding: thickness, ...style }}
    >
      {reduced ? null : (
        <>
          <div
            className="animate-star-movement-bottom pointer-events-none absolute -right-[250%] -bottom-[11px] z-0 h-1/2 w-[300%] rounded-full opacity-90 motion-reduce:hidden"
            style={{
              background: `radial-gradient(circle, ${color}, transparent 12%)`,
              animationDuration: speed,
            }}
          />
          <div
            className="animate-star-movement-top pointer-events-none absolute -top-[10px] -left-[250%] z-0 h-1/2 w-[300%] rounded-full opacity-90 motion-reduce:hidden"
            style={{
              background: `radial-gradient(circle, ${color}, transparent 12%)`,
              animationDuration: speed,
            }}
          />
        </>
      )}
      <div className="relative z-[1]">{children}</div>
    </Component>
  );
}
