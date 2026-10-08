/**
 * Membership diff for department and site chat sync.
 * The database functions in supabase/migrations/20261002100000_chat_hub_sync.sql
 * apply this same diff. They do not take a client member list.
 *
 * Desired user ids are already filtered: non-null user_id, staff.deleted_at is null.
 * Several staff rows may share one user_id; the desired set is one id per person.
 * role_level does not add anyone who is not in that set.
 */

export const CHAT_SYNC_SOURCES = ["DEPARTMENT", "SITE"] as const;

export type ChatSyncSource = "MANUAL" | "DEPARTMENT" | "SITE" | "ROLE" | "SYSTEM";

export type ChatSyncRole = "OWNER" | "ADMIN" | "MODERATOR" | "MEMBER" | "READ_ONLY";

export type ChatSyncMember = {
  userId: string;
  role: ChatSyncRole;
  source: ChatSyncSource;
  left: boolean;
};

export type ChatSyncDiff = {
  add: string[];
  rejoin: string[];
  leave: string[];
  untouched: string[];
};

function sortedUnique(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

/**
 * MANUAL, ROLE, and SYSTEM rows are never rewritten.
 * OWNER and ADMIN are never rewritten, whatever the source.
 * A matching source row that is desired again clears left (rejoin).
 * A matching source row that is no longer desired gets left set.
 * Missing desired users are added. Existing rows are never deleted.
 */
export function diffChatSyncMembers(
  source: (typeof CHAT_SYNC_SOURCES)[number],
  desiredUserIds: readonly string[],
  members: readonly ChatSyncMember[],
): ChatSyncDiff {
  const desired = new Set(desiredUserIds);
  const seen = new Set<string>();
  const add: string[] = [];
  const rejoin: string[] = [];
  const leave: string[] = [];
  const untouched: string[] = [];

  for (const member of members) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);
    const protectedRow = member.source !== source || member.role === "OWNER" || member.role === "ADMIN";
    if (protectedRow) {
      untouched.push(member.userId);
      continue;
    }
    const wanted = desired.has(member.userId);
    if (wanted && member.left) rejoin.push(member.userId);
    else if (!wanted && !member.left) leave.push(member.userId);
    else untouched.push(member.userId);
  }

  for (const userId of desired) {
    if (!seen.has(userId)) add.push(userId);
  }

  return {
    add: sortedUnique(add),
    rejoin: sortedUnique(rejoin),
    leave: sortedUnique(leave),
    untouched: sortedUnique(untouched),
  };
}
