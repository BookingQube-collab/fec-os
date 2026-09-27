"use client";

/**
 * Official React Bits CountUp-TS-TW (https://reactbits.dev/r/CountUp-TS-TW.json).
 * A timed ease replaces the stock spring, which snapped small KPI integers
 * to the final value before the eye could see a count.
 * The markup always holds the final figure. Reduced motion leaves it there.
 */
import { useLayoutEffect, useRef } from "react";

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

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
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

  const formatValue = (latest: number) => {
    const places = (n: number) => {
      const str = n.toString();
      if (!str.includes(".")) return 0;
      const decimals = str.split(".")[1];
      return parseInt(decimals, 10) !== 0 ? decimals.length : 0;
    };
    const maxDecimals = Math.max(places(from), places(to));
    const formatted = Intl.NumberFormat("en-US", {
      useGrouping: !!separator,
      minimumFractionDigits: maxDecimals > 0 ? maxDecimals : 0,
      maximumFractionDigits: maxDecimals > 0 ? maxDecimals : 0,
    }).format(latest);
    return separator ? formatted.replace(/,/g, separator) : formatted;
  };

  const endValue = direction === "down" ? from : to;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const paint = (n: number) => {
      el.textContent = formatValue(n);
    };

    if (reducedMotion || !startWhen) {
      paint(endValue);
      return;
    }

    let raf = 0;
    let cancelled = false;
    let io: IntersectionObserver | undefined;
    let arm = 0;

    const run = () => {
      if (cancelled) return;
      onStartRef.current?.();
      const begin = direction === "down" ? to : from;
      const finish = endValue;
      const delayMs = Math.max(0, delay) * 1000;
      const durationMs = Math.max(0.35, duration) * 1000;
      let origin = 0;
      paint(begin);

      const frame = (now: number) => {
        if (cancelled) return;
        if (!origin) origin = now + delayMs;
        const t = Math.min(1, Math.max(0, (now - origin) / durationMs));
        paint(begin + (finish - begin) * easeOutCubic(t));
        if (t < 1) {
          raf = window.requestAnimationFrame(frame);
        } else {
          paint(finish);
          onEndRef.current?.();
        }
      };
      raf = window.requestAnimationFrame(frame);
    };

    const rect = el.getBoundingClientRect();
    const onScreen = rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    if (onScreen) {
      run();
    } else {
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          io?.disconnect();
          run();
        },
        { threshold: 0.2 },
      );
      io.observe(el);
      arm = window.setTimeout(() => {
        io?.disconnect();
        run();
      }, 900);
    }

    return () => {
      cancelled = true;
      io?.disconnect();
      window.clearTimeout(arm);
      window.cancelAnimationFrame(raf);
      paint(endValue);
    };
  }, [from, to, direction, delay, duration, startWhen, separator, reducedMotion, endValue]);

  return (
    <span className={className} ref={ref}>
      {formatValue(endValue)}
    </span>
  );
}
