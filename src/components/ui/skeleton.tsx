"use client";

import * as React from "react";
import { AsciiSkeleton, type AsciiSkeletonProps } from "ascii-reveal";

import { cn } from "@/lib/utils";

type SkeletonProps = Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  /** Override ASCII glyph style. Default inferred from size. */
  variant?: AsciiSkeletonProps["variant"];
  /** Disable shimmer for long lists. */
  animate?: boolean;
};

const HEIGHT_RE =
  /\bh-(?:\[((?:\d+(?:\.\d+)?)(?:px|rem|em|%|vh)?)\]|(\d+(?:\.\d+)?))\b/;
const WIDTH_RE =
  /\bw-(?:\[((?:\d+(?:\.\d+)?)(?:px|rem|em|%|vh)?)\]|(full|auto|\d+\/\d+|\d+(?:\.\d+)?))\b/;

function tokenToCss(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw === "full") return "100%";
  if (raw === "auto") return "auto";
  const fraction = raw.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den > 0) return `${(num / den) * 100}%`;
  }
  if (/^\d+(\.\d+)?$/.test(raw)) return `${Number(raw) * 0.25}rem`;
  return raw;
}

function parseHeight(className: string, style?: React.CSSProperties): string | undefined {
  const fromStyle = typeof style?.height === "string" ? style.height : undefined;
  if (fromStyle) return fromStyle;
  const m = className.match(HEIGHT_RE);
  return tokenToCss(m?.[1] ?? m?.[2]);
}

function parseWidth(className: string, style?: React.CSSProperties): string | undefined {
  const fromStyle = typeof style?.width === "string" ? style.width : undefined;
  if (fromStyle) return fromStyle;
  const m = className.match(WIDTH_RE);
  return tokenToCss(m?.[1] ?? m?.[2]);
}

function cssToRem(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (value.endsWith("rem")) return parseFloat(value);
  if (value.endsWith("em")) return parseFloat(value);
  if (value.endsWith("px")) return parseFloat(value) / 16;
  if (value.endsWith("%") || value.endsWith("vh")) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function heightToRows(heightCss: string | undefined): number {
  const rem = cssToRem(heightCss);
  if (rem == null) return 5;
  // ~0.7rem per glyph row keeps dense blocks readable without looking empty.
  return Math.max(2, Math.min(24, Math.round(rem / 0.7)));
}

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 9973) + 1;
}

/**
 * Shared loading placeholder. Renders ascii-reveal AsciiSkeleton while keeping
 * the historical `className` height/width API (`h-10`, `h-72`, `w-full`, `rounded-full`).
 * Prefer this over gray pulse bars anywhere content is loading.
 */
function Skeleton({ className, style, variant, animate = true, ...props }: SkeletonProps) {
  const id = React.useId();
  const classes = className ?? "";
  const height = parseHeight(classes, style) ?? "1rem";
  const width = parseWidth(classes, style) ?? "100%";
  const circle = /\brounded-full\b/.test(classes);
  const rem = cssToRem(height);
  const isCompactLine = !circle && rem != null && rem <= 3;
  const resolvedVariant = variant ?? (circle ? "braille" : isCompactLine ? "scan" : "dither");

  // Block-sized skeletons act as tile surfaces (cards/panels), not thin chrome strips.
  const tileSurface = !circle && !isCompactLine;

  return (
    <AsciiSkeleton
      as="div"
      variant={resolvedVariant}
      rows={heightToRows(height)}
      width={width}
      height={height}
      circle={circle}
      seed={seedFromId(id)}
      animate={animate}
      data-ascii={tileSurface ? "surface" : undefined}
      className={cn(tileSurface && "overflow-hidden", classes)}
      style={style}
      {...props}
    />
  );
}

export { Skeleton };
