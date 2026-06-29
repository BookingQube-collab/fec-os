"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface WeeklyReportNumericFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  hint?: string;
}

export function WeeklyReportNumericField({
  label,
  value,
  onChange,
  disabled,
  min = 0,
  max,
  step = 1,
  className,
  hint,
}: WeeklyReportNumericFieldProps) {
  const num = Number(value) || 0;

  const clamp = (n: number) => {
    let v = Math.max(min, n);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const bump = (delta: number) => {
    const next = clamp(num + delta * step);
    onChange(String(next));
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm text-[#334155]">{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled || num <= min}
          onClick={() => bump(-1)}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-center tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled || (max != null && num >= max)}
          onClick={() => bump(1)}
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
