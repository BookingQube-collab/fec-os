import { DEFAULT_PM_CHECKLIST } from "@/lib/arcade/domain";

/** Labels saved on a schedule. Anything else falls back to the standard checklist. */
export function storedChecklistLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_PM_CHECKLIST];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const label = typeof item === "string" ? item.trim().slice(0, 200) : "";
    if (label.length < 2 || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.length > 0 ? labels : [...DEFAULT_PM_CHECKLIST];
}

export type PmScheduleRef = {
  id: string;
  machine_id: string | null;
  next_due_on: string | null;
  active?: boolean;
};

/** One active schedule per game. The earliest due date is the one to update. */
export function scheduleForMachine<T extends PmScheduleRef>(rows: readonly T[], machineId: string): T | null {
  const matches = rows.filter((row) => row.machine_id === machineId && row.active !== false);
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => (a.next_due_on ?? "9999-12-31").localeCompare(b.next_due_on ?? "9999-12-31"))[0] ?? null;
}

export function localIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function pmDueTone(iso: string | null | undefined, today: string): "over" | "today" | "later" | "none" {
  if (!iso) return "none";
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "none";
  if (day < today) return "over";
  if (day === today) return "today";
  return "later";
}
