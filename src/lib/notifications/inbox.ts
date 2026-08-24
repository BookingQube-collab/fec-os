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

export function mergeInboxItems(persisted: InboxItem[], derived: InboxItem[], limit = 40): InboxItem[] {
  const seen = new Set<string>();
  const out: InboxItem[] = [];

  const take = (item: InboxItem) => {
    if (seen.has(item.id)) return;
    const key = sourceKey(item.sourceType, item.sourceId);
    if (key && seen.has(key)) return;
    seen.add(item.id);
    if (key) seen.add(key);
    out.push(item);
  };

  for (const item of derived) take(item);
  for (const item of persisted) take(item);

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

export function inboxUnreadCount(items: InboxItem[]): number {
  return items.filter((item) => !item.readAt).length;
}
