import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusTone =
  | "online"
  | "offline"
  | "pending"
  | "approved"
  | "rejected"
  | "maintenance"
  | "critical"
  | "warning"
  | "completed"
  | "neutral";

const HEALTHY = new Set(["WORKING", "RESOLVED", "CLOSED", "IN_STOCK", "COMPLETED", "DONE", "OPERATIONAL", "PASS", "ACTIVE"]);
const WARNING = new Set(["ATTENTION", "UNDER_OBSERVATION", "HIGH", "LOW_STOCK", "ON_HOLD", "MEDIUM", "PARTIALLY_OPERATIONAL"]);
const CRITICAL = new Set(["DOWN", "CRITICAL", "OUT_OF_SERVICE", "OUT_OF_STOCK", "FAIL"]);
const PENDING = new Set(["WAITING_PART", "WAITING_SUPPLIER", "PLANNED", "REPORTED", "PENDING", "NA"]);
const REPAIR = new Set(["UNDER_REPAIR", "IN_PROGRESS", "DIAGNOSING", "TESTING"]);
const OFFLINE = new Set(["DECOMMISSIONED", "CANCELLED", "CANCELED", "INACTIVE", "OFF"]);

function statusKey(status: string) {
  return status.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/** Visual tone for a stored status. Does not rename the stored value. */
export function equipmentStatusTone(status: string): StatusTone {
  const key = statusKey(status);
  if (HEALTHY.has(key)) return "online";
  if (WARNING.has(key)) return "warning";
  if (CRITICAL.has(key)) return "critical";
  if (PENDING.has(key)) return "pending";
  if (REPAIR.has(key)) return "maintenance";
  if (OFFLINE.has(key)) return "offline";
  if (key === "LOW") return "neutral";
  return "neutral";
}

/** Pulse only for unresolved DOWN or CRITICAL equipment. */
export function equipmentStatusPulse(status: string): boolean {
  const key = statusKey(status);
  return key === "DOWN" || key === "CRITICAL";
}

const STAFF_ONLINE = new Set(["ACTIVE", "PROBATION"]);
const STAFF_WARNING = new Set(["SECONDMENT", "REMOTE", "SERVING_NOTICE"]);
const STAFF_LEAVE = new Set(["ON_LEAVE", "VACATION", "SICK_LEAVE", "UNPAID_LEAVE", "ANNUAL_LEAVE"]);
const STAFF_ENDED = new Set(["TERMINATED", "RESIGNED", "RELEASED"]);

/** Employment status chip. Stored value is unchanged. */
export function staffStatusTone(status: string): StatusTone {
  const key = statusKey(status);
  if (STAFF_ONLINE.has(key)) return "online";
  if (STAFF_WARNING.has(key)) return "warning";
  if (STAFF_LEAVE.has(key)) return "pending";
  if (STAFF_ENDED.has(key)) return "offline";
  return equipmentStatusTone(status);
}

/** Attendance, shift, training, and roster-match chips. Stored value is unchanged. */
export function attendanceStatusTone(status: string): StatusTone {
  const key = statusKey(status);
  if (key === "PRESENT" || key === "WEEKLY_OFF" || key === "PUBLIC_HOLIDAY" || key === "MATCHED") return "online";
  if (key === "ABSENT") return "critical";
  if (
    key === "LATE" ||
    key === "EARLY_DEPARTURE" ||
    key === "EARLY_LEAVE" ||
    key === "SHORT_HOURS" ||
    key === "REVIEW_REQUIRED" ||
    key === "INCOMPLETE" ||
    key === "MISSED_PUNCH" ||
    key === "UNMATCHED" ||
    key === "OVERDUE"
  ) {
    return "warning";
  }
  if (key === "ANNUAL_LEAVE" || key === "SICK_LEAVE" || key === "UNPAID_LEAVE") return "pending";
  if (key === "SCHEDULED" || key === "ENROLLED") return "pending";
  if (key === "OVERTIME" || key === "UNSCHEDULED" || key === "NOT_JOINED" || key === "SKIPPED") return "neutral";
  return equipmentStatusTone(status);
}

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "ds-status inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusIndicator({
  tone,
  label,
  pulse,
}: {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-foreground">
      <span
        data-tone={tone}
        className={cn("ds-status inline-flex h-2.5 w-2.5 rounded-full", pulse && tone === "critical" && "ds-pulse")}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
