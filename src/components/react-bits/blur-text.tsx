"use client";

/**
 * Official React Bits BlurText-TS-TW (https://reactbits.dev/r/BlurText-TS-TW.json).
 * The first paint is the finished string so a failed Motion runtime cannot leave
 * the title at opacity 0. The blur runs after mount, then the static string returns.
 * Reduced motion renders static text.
 */
import { motion, type Easing, type Transition } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ElementType } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

type BlurTextProps = {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  animationFrom?: Record<string, string | number>;
  animationTo?: Array<Record<string, string | number>>;
  easing?: Easing | Easing[];
  onAnimationComplete?: () => void;
  stepDuration?: number;
  as?: ElementType;
};

const buildKeyframes = (
  from: Record<string, string | number>,
  steps: Array<Record<string, string | number>>,
): Record<string, Array<string | number>> => {
  const keys = new Set<string>([...Object.keys(from), ...steps.flatMap((s) => Object.keys(s))]);

  const keyframes: Record<string, Array<string | number>> = {};
  keys.forEach((k) => {
    keyframes[k] = [from[k], ...steps.map((s) => s[k])];
  });
  return keyframes;
};

export default function BlurText({
  text = "",
  delay = 120,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  animationFrom,
  animationTo,
  easing = [0.22, 1, 0.36, 1],
  onAnimationComplete,
  stepDuration = 0.72,
  as: Tag = "p",
}: BlurTextProps) {
  const elements = animateBy === "words" ? text.split(" ") : text.split("");
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<"hold" | "play" | "done">("hold");

  const defaultFrom = useMemo(
    () =>
      direction === "top"
        ? { filter: "blur(18px)", opacity: 0, y: -28 }
        : { filter: "blur(18px)", opacity: 0, y: 28 },
    [direction],
  );

  const defaultTo = useMemo(
    () => [
      {
        filter: "blur(8px)",
        opacity: 0.45,
        y: direction === "top" ? 8 : -8,
      },
      { filter: "blur(0px)", opacity: 1, y: 0 },
    ],
    [direction],
  );

  const fromSnapshot = animationFrom ?? defaultFrom;
  const toSnapshots = animationTo ?? defaultTo;
  const stepCount = toSnapshots.length + 1;
  const totalDuration = stepDuration * (stepCount - 1);
  const times = Array.from({ length: stepCount }, (_, i) => (stepCount === 1 ? 0 : i / (stepCount - 1)));

  useEffect(() => {
    if (reducedMotion) return;
    const node = ref.current;
    let io: IntersectionObserver | undefined;
    let started = false;

    const start = () => {
      if (started) return;
      started = true;
      setPhase("play");
    };

    const visible = () => {
      if (!node) return true;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    };

    if (visible()) start();
    else if (node) {
      io = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) start();
        },
        { threshold, rootMargin },
      );
      io.observe(node);
    }

    const arm = window.setTimeout(start, 400);
    const wordCount = Math.max(elements.length, 1);
    const totalMs = (wordCount - 1) * delay + totalDuration * 1000 + 180;
    const done = window.setTimeout(() => setPhase("done"), Math.max(1400, totalMs));

    return () => {
      io?.disconnect();
      window.clearTimeout(arm);
      window.clearTimeout(done);
    };
  }, [reducedMotion, text, delay, threshold, rootMargin, totalDuration, elements.length]);

  if (reducedMotion || phase !== "play") {
    return (
      <Tag ref={ref} className={className}>
        {text}
      </Tag>
    );
  }

  return (
    <Tag ref={ref} className={`blur-text ${className} flex flex-wrap`}>
      {elements.map((segment, index) => {
        const animateKeyframes = buildKeyframes(fromSnapshot, toSnapshots);

        const spanTransition: Transition = {
          duration: totalDuration,
          times,
          delay: (index * delay) / 1000,
          ease: easing,
        };

        return (
          <motion.span
            key={`${text}-${index}`}
            initial={fromSnapshot}
            animate={animateKeyframes}
            transition={spanTransition}
            onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
            style={{
              display: "inline-block",
              willChange: "transform, filter, opacity",
            }}
          >
            {segment === " " ? "\u00A0" : segment}
            {animateBy === "words" && index < elements.length - 1 && "\u00A0"}
          </motion.span>
        );
      })}
    </Tag>
  );
}
