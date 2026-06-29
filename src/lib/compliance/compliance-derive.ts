export type AlertTier = "No Date" | "Expired" | "Due ≤30" | "Due ≤60" | "OK";
export type LineStatus = "Paid" | "Overdue" | "Due now" | "Upcoming";

export function governingDate(nextDue: string | null, expiry: string | null): string | null {
  return nextDue ?? expiry;
}

export function daysRemaining(governing: string | null, today = new Date().toISOString().slice(0, 10)): number | null {
  if (!governing) return null;
  const d = Math.ceil((new Date(governing).getTime() - new Date(today).getTime()) / 86400000);
  return d;
}

export function alertTier(governing: string | null, today = new Date().toISOString().slice(0, 10)): AlertTier {
  if (!governing) return "No Date";
  const d = daysRemaining(governing, today)!;
  if (d < 0) return "Expired";
  if (d <= 30) return "Due ≤30";
  if (d <= 60) return "Due ≤60";
  return "OK";
}

export function lineStatus(paid: boolean, dueDate: string, today = new Date().toISOString().slice(0, 10)): LineStatus {
  if (paid) return "Paid";
  if (dueDate < today) return "Overdue";
  const week = new Date(today);
  week.setDate(week.getDate() + 7);
  if (dueDate <= week.toISOString().slice(0, 10)) return "Due now";
  return "Upcoming";
}

export function alertTierClass(tier: AlertTier): string {
  if (tier === "Expired" || tier === "Due ≤30") return "rag-red";
  if (tier === "Due ≤60") return "rag-amber";
  if (tier === "OK") return "rag-green";
  return "text-muted-foreground";
}

export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export const COMPLIANCE_DOMAINS = [
  "Corporate Documents",
  "QCDD",
  "Security",
  "HVAC",
  "Kitchen",
  "Pest & Hygiene",
  "Theme Park",
  "Staff Compliance",
  "Insurance",
  "AMC Contract",
  "IT",
] as const;

export function venueMatchesScope(venueScope: string, locationCode: string | null): boolean {
  if (!locationCode || locationCode === "all") return true;
  return venueScope === "All" || venueScope === locationCode;
}
