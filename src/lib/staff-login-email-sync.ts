/**
 * One-time / idempotent login-email sync helpers.
 *
 * Canonical HR contact for payslip delivery and roster is `public.staff.email`.
 * Sign-in uses `auth.users.email`. Payslip ESS access itself keys off `staff.user_id`.
 * This sync pushes roster email → auth so staff can sign in (and any email fan-out
 * that resolves by user id / staff.email) with the revised address.
 */

import { parseStaffLoginEmail } from "@/lib/staff-login";

export const STAFF_LOGIN_EMAIL_SYNC_CONFIRMATION = "SYNC LOGIN EMAILS";

export type StaffLoginEmailSyncDecision =
  | { action: "skip_no_login" }
  | { action: "skip_no_email" }
  | { action: "skip_invalid_email"; staffEmail: string }
  | { action: "skip_already_matched"; email: string }
  | { action: "update_auth"; email: string; previousEmail: string | null }
  | { action: "conflict_taken"; email: string; takenByUserId: string };

export type StaffLoginEmailSyncRow = {
  staffId: string;
  userId: string | null;
  staffEmail: string | null;
  /** Current auth.users.email for userId, lowercased when present. */
  authEmail: string | null;
};

/**
 * Decide whether this linked staff row needs an auth email update.
 * `authByEmail` maps lowercased email → auth user id (for conflict checks).
 */
export function planStaffLoginEmailSync(
  row: StaffLoginEmailSyncRow,
  authByEmail: Map<string, string>,
): StaffLoginEmailSyncDecision {
  if (!row.userId) return { action: "skip_no_login" };

  const raw = (row.staffEmail ?? "").trim();
  if (!raw) return { action: "skip_no_email" };

  const email = parseStaffLoginEmail(raw);
  if (!email) return { action: "skip_invalid_email", staffEmail: raw };

  const previous = (row.authEmail ?? "").trim().toLowerCase() || null;
  if (previous === email) return { action: "skip_already_matched", email };

  const takenBy = authByEmail.get(email);
  if (takenBy && takenBy !== row.userId) {
    return { action: "conflict_taken", email, takenByUserId: takenBy };
  }

  return { action: "update_auth", email, previousEmail: previous };
}

/** Payslip / notification recipient: roster contact email when valid. */
export function resolveStaffPayslipEmail(staffEmail: string | null | undefined): string | null {
  return parseStaffLoginEmail((staffEmail ?? "").trim());
}
