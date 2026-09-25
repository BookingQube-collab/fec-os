"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

export interface FadeContentProps {
  children: ReactNode;
  className?: string;
  blur?: boolean;
  /** Seconds, or ms if > 10 (React Bits compat). */
  duration?: number;
  delay?: number;
  threshold?: number;
  initialOpacity?: number;
  onComplete?: () => void;
}

function toSeconds(val: number) {
  return val > 10 ? val / 1000 : val;
}

/**
 * React Bits FadeContent (TS-TW) API, implemented with motion instead of gsap.
 * Subtle once-on-view fade; respects prefers-reduced-motion.
 */
export default function FadeContent({
  children,
  blur = false,
  duration = 0.45,
  delay = 0,
  threshold = 0.1,
  initialOpacity = 0,
  onComplete,
  className = "",
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: threshold });
  const dur = toSeconds(duration);
  const del = toSeconds(delay);

  if (reducedMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{
        opacity: initialOpacity,
        filter: blur ? "blur(6px)" : "blur(0px)",
      }}
      animate={
        inView
          ? {
              opacity: 1,
              filter: "blur(0px)",
            }
          : undefined
      }
      transition={{ duration: dur, delay: del, ease: "easeOut" }}
      onAnimationComplete={() => {
        if (inView) onComplete?.();
      }}
    >
      {children}
    </motion.div>
  );
}
