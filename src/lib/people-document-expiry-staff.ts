/**
 * Staff-status scope for People → Documents & expiry.
 * The default "active" choice is the Employees directory active cohort
 * (`countsAsActiveStaff`): blank, active, probation, secondment, remote.
 * Jokers are not active. An empty filter is every status.
 */

import {
  countsAsActiveStaff,
  isJokerStaff,
  normalizeDirectoryStatus,
} from "@/lib/staff-status";

/** First-load Documents & expiry staff filter. Same sentinel as the directory. */
export const DOCUMENT_EXPIRY_DEFAULT_STAFF_STATUS = "active";

export function staffIncludedInDocumentExpiry(
  staff: { status?: string | null; employment_type?: string | null },
  statusFilter: string,
): boolean {
  const filter = statusFilter.trim();
  if (!filter) return true;
  const normalized = normalizeDirectoryStatus(filter);
  if (normalized === "joker") return isJokerStaff(staff);
  if (normalized === "active") return countsAsActiveStaff(staff.status, staff.employment_type);
  return normalizeDirectoryStatus(staff.status) === normalized;
}
