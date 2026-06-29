import { cn } from "@/lib/utils";

interface CircularProgressBadgeProps {
  value: number;
  size?: number;
  className?: string;
  positive?: boolean;
}

export function CircularProgressBadge({ value, size = 40, className, positive }: CircularProgressBadgeProps) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;
  const color = positive === false ? "#EF4444" : positive === true ? "#22C55E" : "#8B5CF6";

  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-[#6B7280]">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
