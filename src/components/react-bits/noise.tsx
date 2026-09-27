"use client";

/**
 * Official React Bits Noise-TS-TW (https://reactbits.dev/r/Noise-TS-TW.json).
 * The registry build ignores `patternSize` and paints a 1024² canvas every other frame.
 * This copy honors `patternSize` and fills its parent so the auth page can stay light.
 * Reduced motion paints one still frame and does not refresh it.
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
    const canvas = grainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let frame = 0;
    let animationId = 0;
    const pw = Math.max(32, Math.round(patternSize * patternScaleX));
    const ph = Math.max(32, Math.round(patternSize * patternScaleY));
    const pattern = document.createElement("canvas");
    pattern.width = pw;
    pattern.height = ph;
    const pctx = pattern.getContext("2d", { alpha: true });
    if (!pctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      const cssW = parent?.clientWidth || window.innerWidth;
      const cssH = parent?.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawGrain = () => {
      const imageData = pctx.createImageData(pw, ph);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = patternAlpha;
      }
      pctx.putImageData(imageData, 0, 0);
      const parent = canvas.parentElement;
      const cssW = parent?.clientWidth || window.innerWidth;
      const cssH = parent?.clientHeight || window.innerHeight;
      ctx.clearRect(0, 0, cssW, cssH);
      const fill = ctx.createPattern(pattern, "repeat");
      if (!fill) return;
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    resize();
    drawGrain();
    if (reducedMotion) return;

    const loop = () => {
      if (frame % Math.max(1, patternRefreshInterval) === 0) drawGrain();
      frame++;
      animationId = window.requestAnimationFrame(loop);
    };
    loop();
    const onResize = () => {
      resize();
      drawGrain();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", onResize);
    };
  }, [reducedMotion, patternSize, patternScaleX, patternScaleY, patternRefreshInterval, patternAlpha]);

  return (
    <canvas
      ref={grainRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${className}`}
      style={{ imageRendering: "auto", mixBlendMode: "multiply" }}
    />
  );
}
