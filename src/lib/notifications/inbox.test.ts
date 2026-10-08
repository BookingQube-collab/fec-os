import { describe, expect, it } from "vitest";

import { applyMarkAllRead, inboxUnreadCount, type InboxItem } from "./inbox";

function row(partial: Partial<InboxItem> & Pick<InboxItem, "id" | "persisted">): InboxItem {
  return {
    kind: "notification",
    category: "general",
    title: partial.id,
    titleKey: null,
    titleParams: {},
    body: null,
    severity: "info",
    actionUrl: "/notifications",
    readAt: null,
    createdAt: "2026-10-07T00:00:00.000Z",
    sourceType: null,
    sourceId: null,
    ...partial,
  };
}

describe("inboxUnreadCount", () => {
  it("counts only stored notifications that are still unread", () => {
    const items = [
      row({ id: "notif:1", persisted: true }),
      row({ id: "notif:2", persisted: true, readAt: "2026-10-07T01:00:00.000Z" }),
      row({ id: "pr:1", persisted: false, kind: "procurement" }),
    ];

    expect(inboxUnreadCount(items)).toBe(1);
  });
});

describe("applyMarkAllRead", () => {
  it("clears stored notifications and leaves open work in the list", () => {
    const next = applyMarkAllRead({
      items: [
        row({ id: "notif:1", persisted: true }),
        row({ id: "pr:1", persisted: false, kind: "procurement" }),
      ],
      unreadCount: 2,
      actionCount: 1,
    });

    expect(next.unreadCount).toBe(0);
    expect(next.items.find((item) => item.id === "notif:1")?.readAt).toBeTruthy();
    expect(next.items.find((item) => item.id === "pr:1")?.readAt).toBeNull();
  });
});
