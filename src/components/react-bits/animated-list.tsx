"use client";

/**
 * Official React Bits AnimatedList-TS-TW item motion (scale 0.7 → 1).
 * https://reactbits.dev/r/AnimatedList-TS-TW.json
 *
 * The registry widget only accepts string[] and registers a window Tab handler.
 * This build keeps that item animation for real row children and does not trap Tab.
 * Rows render as normal content until the motion starts, and return to static
 * content when it finishes, so a failed runtime cannot leave them at opacity 0.
 */
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";

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
  const [phase, setPhase] = useState<"hold" | "play" | "done">("hold");

  useEffect(() => {
    const node = ref.current;
    let io: IntersectionObserver | undefined;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setPhase("play");
    };
    if (node) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) start();
      else {
        io = new IntersectionObserver(
          ([entry]) => {
            if (entry?.isIntersecting) start();
          },
          { threshold: 0.2 },
        );
        io.observe(node);
      }
    } else start();

    const arm = window.setTimeout(start, 500);
    const done = window.setTimeout(() => setPhase("done"), (delay + duration) * 1000 + 700);
    return () => {
      io?.disconnect();
      window.clearTimeout(arm);
      window.clearTimeout(done);
    };
  }, [delay, duration]);

  if (phase !== "play") {
    return <div ref={ref}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial={{ scale: 0.86, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration, delay }}
      onAnimationComplete={() => setPhase("done")}
    >
      {children}
    </motion.div>
  );
}

export default function AnimatedList({
  children,
  className = "",
  delay = 0.08,
  duration = 0.55,
}: AnimatedListProps) {
  const reducedMotion = usePrefersReducedMotion();
  const items = Children.toArray(children);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {items.map((child, i) => (
        <AnimatedItem key={i} delay={Math.min(i, 8) * delay} duration={duration}>
          {child}
        </AnimatedItem>
      ))}
    </div>
  );
}
