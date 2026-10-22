/**
 * Pure helpers for in-app popup toasts on new inbox arrivals.
 * First successful sample baselines older unread; recent arrivals still toast once.
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

/** Fresh unread still toast on first poll so a just-arrived approval is not swallowed. */
export const INBOX_TOAST_RECENT_MS = 5 * 60_000;

const APPROVAL_TITLE_RE =
  /approv|needs your|awaiting review|needs review|waiting for|resubmitted|missed punch|punch correction|correction submitted|overtime|ot request/i;

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

function isRecentUnread(item: InboxItem, now: number): boolean {
  const created = Date.parse(item.createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created <= INBOX_TOAST_RECENT_MS;
}

/**
 * First sample baselines older unread (no spam). Recent unread that are not already
 * in seenIds still toast so a just-arrived approval survives page load / refresh.
 * Later ticks toast only newly seen unread ids so polling never re-spams the same item.
 */
export function decideInboxToasts(
  state: InboxToastState,
  items: InboxItem[],
  now = Date.now(),
): InboxToastDecision {
  const unread = toastableInboxItems(items);
  const unreadIds = unread.map((item) => item.id);
  const seen = new Set(state.seenIds);

  if (!state.primed) {
    const toastIds = unread
      .filter((item) => !seen.has(item.id) && isRecentUnread(item, now))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => item.id);

    return {
      next: { primed: true, seenIds: capSeen([...state.seenIds, ...unreadIds]) },
      toastIds,
    };
  }

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
