"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import CountUp from "@/components/react-bits/count-up";
import { parseKpiNumeric, type ParsedKpiNumeric } from "@/components/react-bits/parse-kpi-numeric";
import { cn } from "@/lib/utils";

interface KpiAnimatedValueProps {
  value: string | number;
  className?: string;
  /** CountUp duration in seconds (default ~1s, subtler than React Bits 2s). */
  duration?: number;
}

/**
 * Animates KPI figures once on mount. Non-numeric / reduced-motion → plain text.
 * After the first count finishes, live refreshes update instantly (no re-spring).
 */
export function KpiAnimatedValue({ value, className, duration = 1 }: KpiAnimatedValueProps) {
  const reducedMotion = useReducedMotion();
  const parsed = parseKpiNumeric(value);
  const first = useRef<ParsedKpiNumeric | null>(null);
  const [settled, setSettled] = useState(false);

  if (parsed && first.current == null) {
    first.current = parsed;
  }

  useEffect(() => {
    if (!parsed || reducedMotion) setSettled(true);
  }, [parsed, reducedMotion]);

  if (!parsed || reducedMotion || settled || !first.current) {
    return <span className={cn("tabular-nums", className)}>{value}</span>;
  }

  const target = first.current;

  return (
    <span className={cn("tabular-nums", className)}>
      {target.prefix}
      <CountUp
        to={target.to}
        separator={target.separator}
        duration={duration}
        onEnd={() => setSettled(true)}
      />
      {target.suffix}
    </span>
  );
}
