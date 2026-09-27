"use client";

/**
 * Official React Bits SpotlightCard-TS-TW (https://reactbits.dev/r/SpotlightCard-TS-TW.json).
 * The registry disc is a faint full-card wash, which disappears on light KPI tints.
 * This keeps the cursor-follow radial and draws a tight gold disc, plus one
 * sweep when the card mounts so the effect is visible without hunting for it.
 * Reduced motion renders the card with no spotlight.
 */
import { useEffect, useRef, useState, type CSSProperties, type MouseEventHandler, type PropsWithChildren } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

interface Position {
  x: number;
  y: number;
}

interface SpotlightCardProps extends PropsWithChildren {
  className?: string;
  style?: CSSProperties;
  spotlightColor?: `rgba(${number}, ${number}, ${number}, ${number})`;
}

export default function SpotlightCard({
  children,
  className = "",
  style,
  spotlightColor = "rgba(255, 186, 0, 0.95)",
}: SpotlightCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const divRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 48, y: 40 });
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const el = divRef.current;
    if (!el) return;
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (hovering.current) return;
      if (start == null) start = now;
      const p = Math.min(1, (now - start) / 1100);
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * p);
      const width = el.clientWidth || 240;
      const height = el.clientHeight || 96;
      setPosition({ x: 16 + (width - 32) * eased, y: height * 0.48 });
      setOpacity(p < 0.92 ? 1 : 0);
      if (p < 1) raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [reducedMotion]);

  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (e) => {
    if (!divRef.current || isFocused) return;
    hovering.current = true;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setOpacity(1);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(1);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => {
    hovering.current = true;
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    hovering.current = false;
    setOpacity(0);
  };

  if (reducedMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn("relative isolate overflow-hidden", className)}
      style={style}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-150 ease-out"
        style={{
          opacity,
          background: `radial-gradient(circle 6.75rem at ${position.x}px ${position.y}px, ${spotlightColor}, rgba(245, 197, 24, 0.55) 46%, transparent 70%)`,
        }}
      />
      <div className="relative z-[1] w-full min-w-0 flex-1">{children}</div>
    </div>
  );
}
