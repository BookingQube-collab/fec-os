import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type PillScrollEdges = { start: boolean; end: boolean };

type Rect = { left: number; right: number };

/** Logical overflow from the first/last tab rects. Independent of scrollLeft quirks. */
export function pillScrollEdgesFromRects(
  view: Rect,
  first: Rect | null,
  last: Rect | null,
  rtl: boolean,
): PillScrollEdges {
  if (!first || !last) return { start: false, end: false };
  const slack = 2;
  const overflowLeft = Math.min(first.left, last.left) < view.left - slack;
  const overflowRight = Math.max(first.right, last.right) > view.right + slack;
  return rtl
    ? { start: overflowRight, end: overflowLeft }
    : { start: overflowLeft, end: overflowRight };
}

/** Fade the clipped edge. Physical left/right follow direction. */
export function pillScrollMask(edges: PillScrollEdges, rtl: boolean): string | undefined {
  if (!edges.start && !edges.end) return undefined;
  const fadeLeft = rtl ? edges.end : edges.start;
  const fadeRight = rtl ? edges.start : edges.end;
  const left = fadeLeft ? "transparent" : "#000";
  const right = fadeRight ? "transparent" : "#000";
  return `linear-gradient(to right, ${left} 0, #000 1.75rem, #000 calc(100% - 1.75rem), ${right} 100%)`;
}

export function pillScrollMaskStyle(edges: PillScrollEdges, rtl: boolean): CSSProperties | undefined {
  const mask = pillScrollMask(edges, rtl);
  if (!mask) return undefined;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/** Margin and print utilities belong on the outer frame so scroll buttons stay aligned. */
export function splitPillFrameClass(className?: string): { frame: string; port: string } {
  if (!className) return { frame: "", port: "" };
  const frame: string[] = [];
  const port: string[] = [];
  for (const token of className.trim().split(/\s+/)) {
    if (!token) continue;
    const utility = token.slice(token.lastIndexOf(":") + 1);
    const margin = /^m[trblxyse]?-/.test(utility);
    const print = token.split(":").includes("print");
    if (margin || print) frame.push(token);
    else port.push(token);
  }
  return { frame: frame.join(" "), port: port.join(" ") };
}

export const pillScrollFrameClass = "grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)]";

/** Hug the tabs, but never wider than the page column so overflow stays inside the track. */
export function pillScrollTrackClass(port?: string) {
  const full = port?.split(/\s+/).some((token) => /(^|:)w-full$/.test(token)) ?? false;
  return cn(
    "relative col-start-1 row-start-1 min-w-0 max-w-full",
    full ? "w-full justify-self-stretch" : "w-max justify-self-start",
  );
}

export const pillScrollportClass =
  "flex h-11 min-h-11 w-max min-w-0 max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-full border-0 bg-secondary p-1 text-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function pillTabItemClass(active: boolean) {
  return cn(
    "inline-flex h-full min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2",
    active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-card/70",
  );
}
