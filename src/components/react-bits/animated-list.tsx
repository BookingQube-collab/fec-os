"use client";

import { Children, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  /** Stagger between items in seconds. */
  delay?: number;
  /** Per-item fade duration in seconds. */
  duration?: number;
}

/**
 * React Bits–style staggered list entrance. Flat children only (no nested grids).
 * prefers-reduced-motion → plain render.
 */
export default function AnimatedList({
  children,
  className = "",
  delay = 0.04,
  duration = 0.28,
}: AnimatedListProps) {
  const reducedMotion = useReducedMotion();
  const items = Children.toArray(children);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {items.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, delay: i * delay, ease: "easeOut" }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
