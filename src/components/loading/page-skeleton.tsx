"use client";

import { AsciiSkeleton } from "ascii-reveal";

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-busy="true">
      <div className="flex items-center gap-3">
        <AsciiSkeleton variant="braille" rows={4} width="2.25rem" height="2.25rem" circle seed={1} />
        <div className="min-w-0 flex-1 space-y-2">
          <AsciiSkeleton variant="scan" lines={1} widths={["12rem"]} seed={2} />
          <AsciiSkeleton variant="scan" lines={1} widths={["18rem"]} seed={3} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <AsciiSkeleton
            key={i}
            variant="dither"
            rows={5}
            width="100%"
            height="5rem"
            seed={10 + i}
            className="rounded-lg"
          />
        ))}
      </div>
      <AsciiSkeleton variant="scan" lines={1} widths={["100%"]} seed={20} />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <AsciiSkeleton
            key={i}
            variant="dither"
            rows={3}
            width="100%"
            height="3rem"
            seed={30 + i}
            animate={i > 8 ? false : true}
            className="rounded-md"
          />
        ))}
      </div>
    </div>
  );
}

export function KpiSkeletonStrip({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <AsciiSkeleton
          key={i}
          variant="dither"
          rows={5}
          width="100%"
          height="5rem"
          seed={40 + i}
          className="rounded-lg"
        />
      ))}
    </div>
  );
}
