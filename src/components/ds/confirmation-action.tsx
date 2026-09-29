"use client";

import { useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const HOLD_MS = 700;

/**
 * Destructive confirm. A click or a short tap does nothing.
 * Pointer or Space/Enter must stay down for HOLD_MS.
 * Reduced motion skips the fill animation and still requires the hold.
 */
export function ConfirmationAction({
  label,
  holdingLabel,
  onConfirm,
  disabled,
  className,
  describedBy,
}: {
  label: string;
  holdingLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  describedBy?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  const timer = useRef(0);
  const started = useRef(0);
  const holding = useRef(false);

  const stop = (reset: boolean) => {
    holding.current = false;
    window.clearTimeout(timer.current);
    window.cancelAnimationFrame(frame.current);
    if (reset) setProgress(0);
  };

  const start = () => {
    if (disabled || holding.current) return;
    holding.current = true;
    started.current = performance.now();
    if (reduced) setProgress(1);
    else {
      const tick = (now: number) => {
        if (!holding.current) return;
        const next = Math.min(1, (now - started.current) / HOLD_MS);
        setProgress(next);
        if (next < 1) frame.current = window.requestAnimationFrame(tick);
      };
      frame.current = window.requestAnimationFrame(tick);
    }
    timer.current = window.setTimeout(() => {
      if (!holding.current) return;
      holding.current = false;
      setProgress(0);
      onConfirm();
    }, HOLD_MS);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-describedby={describedBy}
      aria-keyshortcuts="Space Enter"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        start();
      }}
      onPointerUp={() => stop(true)}
      onPointerLeave={() => stop(true)}
      onPointerCancel={() => stop(true)}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        if (event.repeat) return;
        event.preventDefault();
        start();
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        stop(true);
      }}
      onBlur={() => stop(true)}
      className={cn(
        "relative inline-flex min-h-12 items-center justify-center overflow-hidden rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className="ds-hold-fill"
        style={{ ["--p" as string]: String(progress) }}
      />
      <span className="relative">{progress > 0.05 ? (holdingLabel ?? label) : label}</span>
    </button>
  );
}
