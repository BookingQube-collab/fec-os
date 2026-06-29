"use client";

import { useRef, useState } from "react";
import { Eraser } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

export function SignaturePad({ onChange, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return { canvas, ctx };
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const pack = getCtx();
    if (!pack) return;
    pack.ctx.strokeStyle = "#111";
    pack.ctx.lineWidth = 2;
    pack.ctx.lineCap = "round";
    const { x, y } = pointerPos(e);
    pack.ctx.beginPath();
    pack.ctx.moveTo(x, y);
    setDrawing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const pack = getCtx();
    if (!pack) return;
    const { x, y } = pointerPos(e);
    pack.ctx.lineTo(x, y);
    pack.ctx.stroke();
  }

  function endDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function clear() {
    const pack = getCtx();
    if (!pack) return;
    pack.ctx.clearRect(0, 0, pack.canvas.width, pack.canvas.height);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={height}
        className="w-full touch-none rounded-md border border-border bg-white"
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
      />
      <Button type="button" size="sm" variant="outline" onClick={clear}>
        <Eraser className="mr-1.5 h-3.5 w-3.5" />
        Clear signature
      </Button>
    </div>
  );
}
