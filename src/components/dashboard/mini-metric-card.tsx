import { NeumorphicCard } from "./neumorphic-card";

interface MiniMetricCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: "blue" | "cyan" | "purple" | "green";
}

export function MiniMetricCard({ label, value, hint, accent = "purple" }: MiniMetricCardProps) {
  return (
    <NeumorphicCard accent={accent} className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className="mt-2 text-xl font-bold text-[#111827]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[#6B7280]">{hint}</p>}
    </NeumorphicCard>
  );
}
