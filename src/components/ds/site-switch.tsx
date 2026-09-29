"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { venueTitle } from "@/lib/locations/normalize";
import { cn } from "@/lib/utils";

export type SiteSwitchSite = {
  id: string;
  code: string;
  name?: string | null;
  region?: string | null;
};

/**
 * Immediate site choice. Only sites passed in are shown — callers pass rows already loaded.
 * Known codes pick up the roster sheet title (mall included).
 */
export function SiteSwitch({
  value,
  onValueChange,
  sites,
  allLabel,
  ariaLabel,
  className,
}: {
  /** null means every loaded site. */
  value: string | null;
  onValueChange: (id: string | null) => void;
  sites: readonly SiteSwitchSite[];
  allLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0, ready: false });
  const selected = value ?? "__all__";
  const siteKey = sites.map((site) => site.id).join("|");

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const active = row.querySelector<HTMLElement>(`[data-site="${CSS.escape(selected)}"]`);
      if (!active) {
        setThumb((prev) => (prev.ready ? { ...prev, ready: false } : prev));
        return;
      }
      const x = active.offsetLeft;
      const w = active.offsetWidth;
      setThumb((prev) => (prev.ready && prev.x === x && prev.w === w ? prev : { x, w, ready: true }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [selected, siteKey]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative flex max-w-full gap-1 overflow-x-auto rounded-full bg-secondary p-1",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-card shadow-elevated-xs",
          "transition-transform duration-300 ease-[var(--ease-standard)] motion-reduce:transition-none",
          !thumb.ready && "opacity-0",
        )}
        style={{
          width: thumb.w,
          transform: `translateX(${thumb.x}px)`,
        }}
      />
      <SiteChip
        id="__all__"
        label={allLabel}
        selected={selected === "__all__"}
        onSelect={() => onValueChange(null)}
      />
      {sites.map((site) => (
        <SiteChip
          key={site.id}
          id={site.id}
          label={venueTitle(site, site.code)}
          selected={selected === site.id}
          onSelect={() => onValueChange(site.id)}
        />
      ))}
    </div>
  );
}

function SiteChip({
  id,
  label,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      data-site={id}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "relative z-[1] min-h-12 shrink-0 rounded-full px-3 text-xs font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
