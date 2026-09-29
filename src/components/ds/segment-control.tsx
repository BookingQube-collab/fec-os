"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export function SegmentControl<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  layout = "equal",
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
  /** `scroll` keeps long status lists readable instead of squeezing every label. */
  layout?: "equal" | "scroll";
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const rtl = document.documentElement.dir === "rtl";
    const forward = event.key === "ArrowRight" ? !rtl : rtl;
    const step = forward ? 1 : -1;
    const next = options[(index + step + options.length) % options.length];
    if (next) onValueChange(next.value);
  };

  if (layout === "scroll") {
    return (
      <ScrollSegments
        value={value}
        options={options}
        ariaLabel={ariaLabel}
        className={className}
        onKeyDown={onKeyDown}
        onValueChange={onValueChange}
      />
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("relative grid rounded-full bg-secondary p-1", className)}
      style={
        {
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
          "--n": options.length,
          "--i": index,
        } as CSSProperties
      }
    >
      <span className="ds-segment-thumb" aria-hidden />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative z-[1] min-h-9 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ScrollSegments<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  onKeyDown,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0, ready: false });

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const active = row.querySelector<HTMLElement>(`[data-segment="${CSS.escape(value)}"]`);
    if (!active) {
      setThumb((prev) => ({ ...prev, ready: false }));
      return;
    }
    setThumb({ x: active.offsetLeft, w: active.offsetWidth, ready: true });
  }, [value, options]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("relative flex max-w-full gap-1 overflow-x-auto rounded-full bg-secondary p-1", className)}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-card shadow-elevated-xs",
          "transition-transform duration-300 ease-[var(--ease-standard)] motion-reduce:transition-none",
          !thumb.ready && "opacity-0",
        )}
        style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            data-segment={option.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative z-[1] min-h-12 shrink-0 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
