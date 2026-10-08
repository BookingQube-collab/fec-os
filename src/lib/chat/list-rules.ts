import { reportingDescendants } from "@/lib/reporting-chain";
import { isActiveStaffStatus, isJokerEmploymentType } from "@/lib/staff-status";

/**
 * Who appears in the Communication Hub chat list.
 *
 * Conversations stay as they are. A CEO at the top of the reporting line
 * (admin access and role level 100) also sees every still-employed person
 * further down that line, including people with no login. An employee with
 * no direct reports sees teammates who share their reporting manager, and
 * that manager, when those people have a login. A reporting manager keeps
 * the staff rows they can already message. A person who already has a
 * direct chat is that chat, once. Unread, favorites, and mentions stay on
 * real conversation activity.
 */

/** Top of the reporting line. COO is 95 and does not receive this wider list. */
export const CHAT_HUB_FULL_TREE_ROLE_LEVEL = 100;

export type ChatListFilter = "all" | "unread" | "favorites" | "mentions";

export type ChatListConversation = {
  id: string;
  kind: string;
  peerName?: string | null;
  peerUserId?: string | null;
  unreadCount: number;
  mentioned: boolean;
};

export type ChatListPerson = {
  userId: string | null;
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  email: string | null;
  departmentName: string | null;
};

export type HubRosterRow = {
  staffId: string;
  status: string | null;
  userId: string | null;
  reportingManagerStaffId: string | null;
  employmentType?: string | null;
};

/** CEO with admin access. A lower role, including COO, does not list the full tree. */
export function chatHubListsFullReportingTree(roleLevel: number, canViewAdmin: boolean): boolean {
  return canViewAdmin && roleLevel >= CHAT_HUB_FULL_TREE_ROLE_LEVEL;
}

/**
 * Still-employed people on the signed-in person's reporting line.
 * Without the full-tree gate, people who have no login stay hidden.
 */
export function hubRosterRows<T extends HubRosterRow>(input: {
  rows: readonly T[];
  rootStaffId: string | null;
  listFullTree: boolean;
}): T[] {
  const employed = input.rows.filter(
    (row) =>
      row.staffId !== input.rootStaffId &&
      isActiveStaffStatus(row.status) &&
      !isJokerEmploymentType(row.employmentType),
  );
  if (!input.listFullTree) return employed.filter((row) => Boolean(row.userId));
  if (!input.rootStaffId) return [];
  const managers = new Map(input.rows.map((row) => [row.staffId, row.reportingManagerStaffId]));
  const tree = reportingDescendants(input.rootStaffId, managers);
  return employed.filter((row) => tree.has(row.staffId));
}

/** CEO and COO company directory: people still employed, including secondment. Former staff stay out. */
export function companyDirectoryRows<T extends { status: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => isActiveStaffStatus(row.status));
}

/**
 * Use the manager's crew instead of every staff row the login can already open.
 * Company directories and people who have their own reports keep the wider list.
 */
export function chatDirectoryUsesManagerCrew(input: {
  listsFullTree: boolean;
  seesEveryone: boolean;
  hasDirectReports: boolean;
  managerStaffId: string | null;
}): boolean {
  if (input.listsFullTree || input.seesEveryone || input.hasDirectReports) return false;
  return Boolean(input.managerStaffId);
}

/**
 * Teammates who share the viewer's reporting manager, plus that manager.
 * The viewer, other branches, former staff, and people without a login stay out.
 */
export function managerCrewDirectoryRows<T extends HubRosterRow>(input: {
  rows: readonly T[];
  viewerStaffId: string | null;
  managerStaffId: string | null;
}): T[] {
  if (!input.viewerStaffId || !input.managerStaffId) return [];
  return input.rows.filter((row) => {
    if (row.staffId === input.viewerStaffId) return false;
    const onCrew = row.reportingManagerStaffId === input.managerStaffId;
    const isManager = row.staffId === input.managerStaffId;
    if (!onCrew && !isManager) return false;
    if (!isActiveStaffStatus(row.status)) return false;
    if (isJokerEmploymentType(row.employmentType)) return false;
    if (!row.userId) return false;
    return true;
  });
}

function includesNeedle(value: string | null | undefined, needle: string): boolean {
  return Boolean(value && value.toLowerCase().includes(needle));
}

/** Direct-chat peers, so the same person is not also listed as a new contact. */
export function directChatPeerIds(conversations: readonly ChatListConversation[]): Set<string> {
  const ids = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.kind === "DIRECT" && conversation.peerUserId) ids.add(conversation.peerUserId);
  }
  return ids;
}

export function visibleChatList<C extends ChatListConversation, P extends ChatListPerson>(input: {
  conversations: readonly C[];
  people: readonly P[];
  filter: ChatListFilter;
  favoriteIds: ReadonlySet<string>;
  query: string;
  conversationName: (conversation: C) => string;
  conversationPreview: (conversation: C) => string;
}): { conversations: C[]; people: P[] } {
  const needle = input.query.trim().toLowerCase();
  const peers = directChatPeerIds(input.conversations);
  const conversations = input.conversations.filter((conversation) => {
    if (input.filter === "unread" && conversation.unreadCount < 1) return false;
    if (input.filter === "favorites" && !input.favoriteIds.has(conversation.id)) return false;
    if (input.filter === "mentions" && !conversation.mentioned) return false;
    if (!needle) return true;
    return (
      includesNeedle(input.conversationName(conversation), needle) ||
      includesNeedle(input.conversationPreview(conversation), needle) ||
      includesNeedle(conversation.peerName, needle)
    );
  });
  const people =
    input.filter === "all"
      ? input.people.filter((person) => {
          if (person.userId && peers.has(person.userId)) return false;
          if (!needle) return true;
          return [person.fullName, person.employeeCode, person.email, person.jobTitle, person.departmentName].some(
            (value) => includesNeedle(value, needle),
          );
        })
      : [];
  return { conversations, people };
}
