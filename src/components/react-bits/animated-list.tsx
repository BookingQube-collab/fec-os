"use client";

/**
 * Official React Bits AnimatedList-TS-TW item motion (scale 0.7 → 1).
 * https://reactbits.dev/r/AnimatedList-TS-TW.json
 *
 * The registry widget only accepts string[] and registers a window Tab handler.
 * This build keeps that item animation for real row children and does not trap Tab.
 */
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "motion/react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export interface AnimatedListProps {
  children?: ReactNode;
  className?: string;
  /** Stagger between items in seconds. */
  delay?: number;
  /** Per-item duration in seconds. */
  duration?: number;
}

function AnimatedItem({
  children,
  delay,
  duration,
}: {
  children: ReactNode;
  delay: number;
  duration: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25, once: true });
  const [force, setForce] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setForce(true), 700);
    return () => window.clearTimeout(id);
  }, []);

  const show = inView || force;

  return (
    <motion.div
      ref={ref}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={show ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
      transition={{ duration, delay }}
    >
      {children}
    </motion.div>
  );
}

export default function AnimatedList({
  children,
  className = "",
  delay = 0.05,
  duration = 0.35,
}: AnimatedListProps) {
  const reducedMotion = usePrefersReducedMotion();
  const items = Children.toArray(children);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {items.map((child, i) => (
        <AnimatedItem key={i} delay={Math.min(i, 10) * delay} duration={duration}>
          {child}
        </AnimatedItem>
      ))}
    </div>
  );
}
