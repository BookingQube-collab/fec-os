export type InboxItemKind =
  | "notification"
  | "procurement"
  | "maintenance"
  | "work_order"
  | "event_task"
  | "snag"
  | "weekly_report"
  | "evaluation";

export type InboxSeverity = "info" | "warning" | "critical";

export type InboxItem = {
  id: string;
  kind: InboxItemKind;
  category: string;
  title: string;
  titleKey: string | null;
  titleParams: Record<string, string>;
  body: string | null;
  severity: InboxSeverity;
  actionUrl: string;
  readAt: string | null;
  createdAt: string;
  sourceType: string | null;
  sourceId: string | null;
  persisted: boolean;
};

export type ActionInboxPayload = {
  items: InboxItem[];
  unreadCount: number;
  actionCount: number;
};

export function sourceKey(sourceType: string | null | undefined, sourceId: string | null | undefined): string | null {
  if (!sourceType || !sourceId) return null;
  return `${sourceType}:${sourceId}`;
}

/**
 * Merge stored notifications with derived open-work.
 * Same source key: unread persisted wins (keeps the bell badge), else derived
 * open-work wins over a read notification so approvals stay visible.
 */
export function mergeInboxItems(persisted: InboxItem[], derived: InboxItem[], limit = 40): InboxItem[] {
  const byId = new Map<string, InboxItem>();
  const bySource = new Map<string, InboxItem[]>();
  const unkeyed: InboxItem[] = [];

  const add = (item: InboxItem) => {
    if (byId.has(item.id)) return;
    byId.set(item.id, item);
    const key = sourceKey(item.sourceType, item.sourceId);
    if (!key) {
      unkeyed.push(item);
      return;
    }
    const group = bySource.get(key) ?? [];
    group.push(item);
    bySource.set(key, group);
  };

  for (const item of derived) add(item);
  for (const item of persisted) add(item);

  const pickFromGroup = (group: InboxItem[]): InboxItem => {
    const unreadPersisted = group.find((row) => row.persisted && !row.readAt);
    if (unreadPersisted) return unreadPersisted;
    const openWork = group.find((row) => !row.persisted);
    if (openWork) return openWork;
    return [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
  };

  const out = [...unkeyed, ...[...bySource.values()].map(pickFromGroup)];

  return out
    .sort((a, b) => {
      const aAction = a.persisted ? 1 : 0;
      const bAction = b.persisted ? 1 : 0;
      if (aAction !== bAction) return aAction - bAction;
      const aRead = a.readAt ? 1 : 0;
      const bRead = b.readAt ? 1 : 0;
      if (aRead !== bRead) return aRead - bRead;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, limit);
}

/** Open work (approvals, tasks) stays in the inbox, but it is not an unread notification. */
export function inboxUnreadCount(items: InboxItem[]): number {
  return items.filter((item) => item.persisted && !item.readAt).length;
}

export function applyMarkAllRead(payload: ActionInboxPayload, readAt = new Date().toISOString()): ActionInboxPayload {
  const items = payload.items.map((item) =>
    item.persisted && !item.readAt ? { ...item, readAt } : item,
  );
  return { ...payload, items, unreadCount: inboxUnreadCount(items) };
}
