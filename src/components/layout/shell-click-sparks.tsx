"use client";

/**
 * Shell-level click sparks as a fixed overlay (not a wrapper).
 * Wrapping the whole AppShell in ClickSpark remounted the tree and blanked
 * children while next/dynamic loaded — freezing People / dense pages.
 */
import { useCallback, useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

const SPARK_COLOR = "#1a1a1a";
const SPARK_SIZE = 8;
const SPARK_RADIUS = 14;
const SPARK_COUNT = 8;
const DURATION = 400;

export function ShellClickSparks() {
  const reducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const frameRef = useRef<number | null>(null);

  const easeOut = useCallback((t: number) => t * (2 - t), []);

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= DURATION) return false;

        const progress = elapsed / DURATION;
        const eased = easeOut(progress);
        const distance = eased * SPARK_RADIUS;
        const lineLength = SPARK_SIZE * (1 - eased);

        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        ctx.strokeStyle = SPARK_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        return true;
      });

      if (sparksRef.current.length > 0) {
        frameRef.current = requestAnimationFrame(draw);
      } else {
        frameRef.current = null;
      }
    },
    [easeOut],
  );

  useEffect(() => {
    if (reducedMotion) return;

    syncSize();
    const onResize = () => syncSize();
    window.addEventListener("resize", onResize);

    const onClick = (e: MouseEvent) => {
      syncSize();
      const now = performance.now();
      sparksRef.current.push(
        ...Array.from({ length: SPARK_COUNT }, (_, i) => ({
          x: e.clientX,
          y: e.clientY,
          angle: (2 * Math.PI * i) / SPARK_COUNT,
          startTime: now,
        })),
      );
      if (frameRef.current == null) {
        frameRef.current = requestAnimationFrame(draw);
      }
    };

    // Bubble phase so controls still receive the click first.
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("click", onClick);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [draw, reducedMotion, syncSize]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[15] h-dvh w-screen"
      aria-hidden
    />
  );
}
