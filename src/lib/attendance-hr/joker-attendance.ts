import { isJokerStaff } from "@/lib/staff-status";

/**
 * Jokers (employment_type=joker and/or status=joker) are on-call / day labour.
 * With no punches they must not become Absent — prefer unscheduled / omit.
 * Leave, week-off, and holiday still use their normal statuses.
 */
export function shouldSuppressPunchlessJokerAbsent(input: {
  status?: string | null;
  employmentType?: string | null;
  employment_type?: string | null;
  hasPunches: boolean;
  weekOff?: boolean;
  leaveType?: string | null;
  holidayName?: string | null;
}): boolean {
  if (input.hasPunches) return false;
  if (input.weekOff) return false;
  if (input.leaveType) return false;
  if (input.holidayName) return false;
  return isJokerStaff({
    status: input.status,
    employment_type: input.employment_type ?? input.employmentType,
  });
}

/** Stored or calculated Absent with no punches → Unscheduled for jokers. */
export function resolvePunchlessJokerListingStatus(input: {
  status: string;
  employmentType?: string | null;
  employment_type?: string | null;
  staffStatus?: string | null;
  hasIn: boolean;
  hasOut: boolean;
}): string {
  if (input.hasIn || input.hasOut) return input.status;
  const key = String(input.status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (key !== "absent") return input.status;
  if (
    !isJokerStaff({
      status: input.staffStatus,
      employment_type: input.employment_type ?? input.employmentType,
    })
  ) {
    return input.status;
  }
  return "unscheduled";
}
