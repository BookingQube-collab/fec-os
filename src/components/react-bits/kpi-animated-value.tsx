"use client";

import { useEffect, useRef, useState } from "react";

import CountUp from "@/components/react-bits/count-up";
import { parseKpiNumeric, type ParsedKpiNumeric } from "@/components/react-bits/parse-kpi-numeric";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

interface KpiAnimatedValueProps {
  value: string | number;
  className?: string;
  /** CountUp duration in seconds. */
  duration?: number;
}

/**
 * Counts a KPI figure once. Non-numeric values and reduced motion stay static.
 * Later live refreshes swap in the new text without replaying the spring.
 */
export function KpiAnimatedValue({ value, className, duration = 1.8 }: KpiAnimatedValueProps) {
  const reducedMotion = usePrefersReducedMotion();
  const parsed = parseKpiNumeric(value);
  const first = useRef<ParsedKpiNumeric | null>(null);
  const [settled, setSettled] = useState(false);

  if (parsed && first.current == null) {
    first.current = parsed;
  }

  useEffect(() => {
    if (!parseKpiNumeric(value) || reducedMotion || settled) return;
    const id = window.setTimeout(() => setSettled(true), (duration + 0.45) * 1000);
    return () => window.clearTimeout(id);
  }, [value, reducedMotion, settled, duration]);

  if (!parsed || reducedMotion || settled || !first.current) {
    return <span className={cn("tabular-nums", className)}>{value}</span>;
  }

  const target = first.current;

  return (
    <span className={cn("tabular-nums", className)} aria-label={String(value)}>
      <span aria-hidden>
        {target.prefix}
        <CountUp
          to={target.to}
          separator={target.separator}
          duration={duration}
          onEnd={() => setSettled(true)}
        />
        {target.suffix}
      </span>
    </span>
  );
}
