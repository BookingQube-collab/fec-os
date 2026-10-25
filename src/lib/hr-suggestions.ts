import { canActorPerform } from "@/lib/arcade/access";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import type { AppRole } from "@/lib/rbac";

export const SUGGESTION_STATUSES = ["new", "seen", "closed"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_CATEGORIES = ["operations", "hr", "safety", "other"] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export type SuggestionActor = {
  jobTitle?: string | null;
  staffRole?: string | null;
  department?: string | null;
  staffId?: string | null;
  employeeCode?: string | null;
  email?: string | null;
  fullName?: string | null;
  displayName?: string | null;
};

/**
 * Admin seats (admin.view: ceo / coo / regional_ops) plus Head of Operations title.
 * HoO also receives admin.view via canActorPerform; title check keeps the product rule explicit.
 */
export function canReviewStaffSuggestions(
  roles: readonly string[],
  actor?: SuggestionActor | null,
): boolean {
  const list = roles as AppRole[];
  if (isHeadOfOperationsTitle(actor?.jobTitle)) return true;
  return canActorPerform(list, "admin.view", actor ?? null);
}
