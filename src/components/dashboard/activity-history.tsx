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

const toneClass = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  danger: "bg-red-100 text-red-700 border-red-200",
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
};

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
      <div className="border-b border-[#EEF0FF] px-5 py-4">
        <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
      </div>
      <div className="divide-y divide-[#EEF0FF]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-[#9CA3AF]">No recent activity.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] text-xs font-semibold text-white">
                {initials(row.title)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#111827]">{row.title}</p>
                <p className="text-xs text-[#9CA3AF]">{row.subtitle ?? row.time}</p>
              </div>
              {row.category && (
                <span className="hidden text-xs text-[#6B7280] sm:inline">{row.category}</span>
              )}
              {row.amount && <span className="text-sm font-semibold text-[#111827]">{row.amount}</span>}
              <Badge variant="outline" className={toneClass[row.statusTone ?? "neutral"]}>
                {row.status}
              </Badge>
            </div>
          ))
        )}
      </div>
    </NeumorphicCard>
  );
}
