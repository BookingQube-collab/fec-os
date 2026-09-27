"use client";

/**
 * Official React Bits Noise-TS-TW (https://reactbits.dev/r/Noise-TS-TW.json).
 * The registry build ignores `patternSize` and paints a 1024² canvas every other frame.
 * This copy honors `patternSize` and fills its parent so the auth page can stay light.
 * Reduced motion renders nothing.
 */
import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

interface NoiseProps {
  patternSize?: number;
  patternScaleX?: number;
  patternScaleY?: number;
  patternRefreshInterval?: number;
  patternAlpha?: number;
  className?: string;
}

export default function Noise({
  patternSize = 96,
  patternScaleX = 1,
  patternScaleY = 1,
  patternRefreshInterval = 8,
  patternAlpha = 22,
  className = "",
}: NoiseProps) {
  const reducedMotion = usePrefersReducedMotion();
  const grainRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = grainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let frame = 0;
    let animationId = 0;
    const w = Math.max(8, Math.round(patternSize * patternScaleX));
    const h = Math.max(8, Math.round(patternSize * patternScaleY));

    const drawGrain = () => {
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = patternAlpha;
      }
      ctx.putImageData(imageData, 0, 0);
    };

    canvas.width = w;
    canvas.height = h;

    const loop = () => {
      if (frame % Math.max(1, patternRefreshInterval) === 0) drawGrain();
      frame++;
      animationId = window.requestAnimationFrame(loop);
    };

    loop();
    return () => window.cancelAnimationFrame(animationId);
  }, [reducedMotion, patternSize, patternScaleX, patternScaleY, patternRefreshInterval, patternAlpha]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={grainRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
