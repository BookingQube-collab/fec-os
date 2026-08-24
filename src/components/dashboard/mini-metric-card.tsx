import { KPI_TINT_CLASS, widgetAccentToTint } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

interface MiniMetricCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: "blue" | "cyan" | "purple" | "green" | "amber" | "red";
}

export function MiniMetricCard({ label, value, hint, accent = "blue" }: MiniMetricCardProps) {
  const tint = widgetAccentToTint(accent);
  return (
    <div className={cn("rounded-2xl border p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]", KPI_TINT_CLASS[tint])}>
      <p className="text-label">{label}</p>
      <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
