/**
 * Pure helpers for in-app popup toasts on new inbox arrivals.
 * First successful sample is a baseline (no spam for existing unread).
 */

import type { InboxItem } from "@/lib/notifications/inbox";

export type InboxToastState = {
  primed: boolean;
  /** Notification ids already shown or present at baseline. */
  seenIds: string[];
};

export type InboxToastDecision = {
  next: InboxToastState;
  /** Ids that should show a toast this tick (newest first). */
  toastIds: string[];
};

const SEEN_CAP = 200;

const APPROVAL_TITLE_RE =
  /approv|needs your|awaiting review|needs review|waiting for verification|resubmitted/i;

const APPROVAL_CATEGORIES = new Set([
  "procurement",
  "hr_leave",
  "hr_ot",
  "hr_payroll",
  "hr_recruitment",
  "hr_disciplinary",
]);

const APPROVAL_TITLE_KEYS = new Set([
  "inbox.prApprove",
  "inbox.snagApproval",
  "inbox.weeklyReport",
  "inbox.evalReview",
  "inbox.maintPending",
]);

/** Unread persisted rows eligible for popup toasts. */
export function toastableInboxItems(items: InboxItem[]): InboxItem[] {
  return items.filter((item) => item.persisted && !item.readAt);
}

export function isApprovalInboxItem(
  item: Pick<InboxItem, "title" | "category" | "titleKey">,
): boolean {
  if (item.titleKey && APPROVAL_TITLE_KEYS.has(item.titleKey)) return true;
  if (APPROVAL_CATEGORIES.has(item.category)) return true;
  return APPROVAL_TITLE_RE.test(item.title);
}

/**
 * First sample baselines current unread ids (no toast). Later ticks toast only
 * newly seen unread ids so polling never re-spams the same item.
 */
export function decideInboxToasts(state: InboxToastState, items: InboxItem[]): InboxToastDecision {
  const unread = toastableInboxItems(items);
  const unreadIds = unread.map((item) => item.id);

  if (!state.primed) {
    return {
      next: { primed: true, seenIds: capSeen(unreadIds) },
      toastIds: [],
    };
  }

  const seen = new Set(state.seenIds);
  const toastIds = unread
    .filter((item) => !seen.has(item.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => item.id);

  return {
    next: { primed: true, seenIds: capSeen([...state.seenIds, ...toastIds]) },
    toastIds,
  };
}

function capSeen(ids: string[]): string[] {
  if (ids.length <= SEEN_CAP) return ids;
  return ids.slice(ids.length - SEEN_CAP);
}
