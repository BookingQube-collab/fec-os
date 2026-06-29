export type MaintenancePriority = "normal" | "medium" | "urgent";

export const MAINTENANCE_PRIORITIES: MaintenancePriority[] = ["normal", "medium", "urgent"];

export const SLA_LABELS: Record<MaintenancePriority, string> = {
  normal: "48h resolution",
  medium: "24h resolution",
  urgent: "1h response / 4h max",
};

export function computeSlaDates(
  priority: MaintenancePriority,
  createdAt: Date = new Date(),
): { slaResponseDueAt: Date; slaDueAt: Date } {
  const base = createdAt.getTime();
  const hour = 60 * 60 * 1000;

  switch (priority) {
    case "urgent":
      return {
        slaResponseDueAt: new Date(base + hour),
        slaDueAt: new Date(base + 4 * hour),
      };
    case "medium":
      return {
        slaResponseDueAt: new Date(base + 24 * hour),
        slaDueAt: new Date(base + 24 * hour),
      };
    default:
      return {
        slaResponseDueAt: new Date(base + 48 * hour),
        slaDueAt: new Date(base + 48 * hour),
      };
  }
}

export function isNearSlaBreach(slaDueAt: string | null, now = Date.now()): boolean {
  if (!slaDueAt) return false;
  const due = new Date(slaDueAt).getTime();
  const twoHours = 2 * 60 * 60 * 1000;
  return now < due && due - now <= twoHours;
}

export function isSlaOverdue(slaDueAt: string | null, status: string, now = Date.now()): boolean {
  if (!slaDueAt) return false;
  if (status === "completed" || status === "cancelled") return false;
  return new Date(slaDueAt).getTime() < now;
}
