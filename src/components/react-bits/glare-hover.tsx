"use client";

/**
 * Official React Bits GlareHover-TS-TW (https://reactbits.dev/r/GlareHover-TS-TW.json).
 * Primary FEC buttons do not use this wrapper: it is a fixed-size grid with its own
 * border, which would clip labels and break `asChild`. They share the same sweep
 * through the `.fec-glare` class on `Button`.
 * Reduced motion skips the overlay.
 */
import React, { useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

interface GlareHoverProps {
  width?: string;
  height?: string;
  background?: string;
  borderRadius?: string;
  borderColor?: string;
  children?: React.ReactNode;
  glareColor?: string;
  glareOpacity?: number;
  glareAngle?: number;
  glareSize?: number;
  transitionDuration?: number;
  playOnce?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function glareRgba(glareColor: string, glareOpacity: number) {
  const hex = glareColor.replace("#", "");
  if (/^[\dA-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${glareOpacity})`;
  }
  if (/^[\dA-Fa-f]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${glareOpacity})`;
  }
  return glareColor;
}

const GlareHover: React.FC<GlareHoverProps> = ({
  width = "auto",
  height = "auto",
  background = "transparent",
  borderRadius = "999px",
  borderColor = "transparent",
  children,
  glareColor = "#ffffff",
  glareOpacity = 0.35,
  glareAngle = -45,
  glareSize = 250,
  transitionDuration = 650,
  playOnce = false,
  className = "",
  style = {},
}) => {
  const rgba = glareRgba(glareColor, glareOpacity);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  const animateIn = () => {
    const el = overlayRef.current;
    if (!el || reduced) return;
    el.style.transition = "none";
    el.style.backgroundPosition = "-100% -100%, 0 0";
    el.style.transition = `${transitionDuration}ms ease`;
    el.style.backgroundPosition = "100% 100%, 0 0";
  };

  const animateOut = () => {
    const el = overlayRef.current;
    if (!el || reduced) return;
    el.style.transition = playOnce ? "none" : `${transitionDuration}ms ease`;
    el.style.backgroundPosition = "-100% -100%, 0 0";
  };

  return (
    <div
      className={cn("relative grid place-items-center overflow-hidden", className)}
      style={{ width, height, background, borderRadius, borderColor, ...style }}
      onMouseEnter={animateIn}
      onMouseLeave={animateOut}
    >
      {reduced ? null : (
        <div
          ref={overlayRef}
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(${glareAngle}deg, transparent 60%, ${rgba} 70%, transparent 100%)`,
            backgroundSize: `${glareSize}% ${glareSize}%, 100% 100%`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "-100% -100%, 0 0",
            pointerEvents: "none",
          }}
        />
      )}
      {children}
    </div>
  );
};

export default GlareHover;
