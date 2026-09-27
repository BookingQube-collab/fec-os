"use client";

/**
 * Official React Bits CountUp-TS-TW (https://reactbits.dev/r/CountUp-TS-TW.json).
 * Reduced motion shows the final value. Starts when the figure is actually on screen.
 */
import { useInView, useMotionValue, useSpring } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export interface CountUpProps {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
  startWhen?: boolean;
  separator?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export default function CountUp({
  to,
  from = 0,
  direction = "up",
  delay = 0,
  duration = 2,
  className = "",
  startWhen = true,
  separator = "",
  onStart,
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  onStartRef.current = onStart;
  onEndRef.current = onEnd;
  const reducedMotion = usePrefersReducedMotion();
  const motionValue = useMotionValue(direction === "down" ? to : from);
  const [onScreen, setOnScreen] = useState(false);

  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);

  const springValue = useSpring(motionValue, {
    damping,
    stiffness,
  });

  const isInView = useInView(ref, { once: true, margin: "0px" });

  const getDecimalPlaces = (num: number): number => {
    const str = num.toString();
    if (str.includes(".")) {
      const decimals = str.split(".")[1];
      if (parseInt(decimals, 10) !== 0) {
        return decimals.length;
      }
    }
    return 0;
  };

  const maxDecimals = Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

  const formatValue = useCallback(
    (latest: number) => {
      const hasDecimals = maxDecimals > 0;

      const options: Intl.NumberFormatOptions = {
        useGrouping: !!separator,
        minimumFractionDigits: hasDecimals ? maxDecimals : 0,
        maximumFractionDigits: hasDecimals ? maxDecimals : 0,
      };

      const formattedNumber = Intl.NumberFormat("en-US", options).format(latest);

      return separator ? formattedNumber.replace(/,/g, separator) : formattedNumber;
    },
    [maxDecimals, separator],
  );

  const startValue = reducedMotion || direction === "down" ? to : from;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
        setOnScreen(true);
      }
    };
    check();
    const id = window.setTimeout(check, 60);
    return () => window.clearTimeout(id);
  }, [to, from]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = formatValue(reducedMotion ? to : direction === "down" ? to : from);
  }, [from, to, direction, formatValue, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || !startWhen || !(isInView || onScreen)) return;

    onStartRef.current?.();

    const timeoutId = window.setTimeout(() => {
      motionValue.set(direction === "down" ? from : to);
    }, delay * 1000);

    const durationTimeoutId = window.setTimeout(() => {
      onEndRef.current?.();
    }, delay * 1000 + duration * 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(durationTimeoutId);
    };
  }, [isInView, onScreen, startWhen, motionValue, direction, from, to, delay, duration, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    const unsubscribe = springValue.on("change", (latest: number) => {
      if (ref.current) {
        ref.current.textContent = formatValue(latest);
      }
    });

    return () => unsubscribe();
  }, [springValue, formatValue, reducedMotion]);

  return (
    <span className={className} ref={ref}>
      {formatValue(startValue)}
    </span>
  );
}
