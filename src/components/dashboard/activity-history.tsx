import { Badge } from "@/components/ui/badge";
import { NeumorphicCard } from "./neumorphic-card";

export interface ActivityRow {
  id: string;
  title: string;
  subtitle?: string;
  time: string;
  amount?: string;
  category?: string;
  status: string;
  statusTone?: "success" | "warning" | "danger" | "neutral";
}

const toneVariant = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  neutral: "muted",
} as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function ActivityHistory({ rows, title = "Recent activity" }: { rows: ActivityRow[]; title?: string }) {
  return (
    <NeumorphicCard className="p-0">
      <div className="border-b border-border/80 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="divide-y divide-border/70">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {initials(row.title)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.subtitle ?? row.time}</p>
              </div>
              {row.category && (
                <span className="hidden text-xs text-muted-foreground sm:inline">{row.category}</span>
              )}
              {row.amount && (
                <span className="text-sm font-semibold tabular-nums text-foreground">{row.amount}</span>
              )}
              <Badge variant={toneVariant[row.statusTone ?? "neutral"]}>{row.status}</Badge>
            </div>
          ))
        )}
      </div>
    </NeumorphicCard>
  );
}
