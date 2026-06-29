import type { ComplianceStatus } from "@/lib/compliance-tracker/constants";

export function getStatus(expiryDate: Date | null): ComplianceStatus {
  if (!expiryDate) return "Missing";
  const days = Math.floor((expiryDate.getTime() - Date.now()) / 86400000);
  if (days < 0) return "Overdue";
  if (days <= 30) return "Critical";
  if (days <= 60) return "Warning";
  return "Compliant";
}

export function getDaysToExpiry(expiryDate: Date | null): number | null {
  if (!expiryDate) return null;
  return Math.floor((expiryDate.getTime() - Date.now()) / 86400000);
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function enrichItem<T extends { expiry_date?: string | null }>(
  row: T,
): T & { computed_status: ComplianceStatus; days_to_expiry: number | null } {
  const expiry = parseDate(row.expiry_date ?? null);
  return {
    ...row,
    computed_status: getStatus(expiry),
    days_to_expiry: getDaysToExpiry(expiry),
  };
}

export function isExpiringWithin30Days(status: ComplianceStatus): boolean {
  return status === "Critical";
}

export function statusBadgeStyle(status: ComplianceStatus): { backgroundColor: string; color: string } {
  const map: Record<ComplianceStatus, { bg: string; text: string }> = {
    Compliant: { bg: "#1E7B45", text: "#FFFFFF" },
    Upcoming: { bg: "#E8A33D", text: "#0A1228" },
    Warning: { bg: "#E8A33D", text: "#0A1228" },
    Critical: { bg: "#C0392B", text: "#FFFFFF" },
    Overdue: { bg: "#C0392B", text: "#FFFFFF" },
    Missing: { bg: "#C0392B", text: "#FFFFFF" },
  };
  const c = map[status];
  return { backgroundColor: c.bg, color: c.text };
}

export function getAnchorMonth(expiryDate: string | null, contractEnd: string | null): number | null {
  const anchor = expiryDate ?? contractEnd;
  if (!anchor) return null;
  const d = parseDate(anchor);
  if (!d) return null;
  return d.getMonth() + 1;
}

export function isDueInMonth(
  month: number,
  frequency: string,
  anchorMonth: number | null,
): boolean {
  if (frequency === "Monthly") return true;
  if (!anchorMonth) return false;
  if (frequency === "Quarterly") return (month - anchorMonth) % 3 === 0;
  if (frequency === "Annual") return month === anchorMonth;
  return false;
}

export function getSchedulerStatus(
  frequency: string,
  anchorMonth: number | null,
): "Scheduled" | "Pending Setup" {
  if (frequency === "Monthly") return "Scheduled";
  if ((frequency === "Quarterly" || frequency === "Annual") && anchorMonth) return "Scheduled";
  return "Pending Setup";
}

export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseDate(value);
  if (!d) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
