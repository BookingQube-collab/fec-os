import { describe, expect, it } from "vitest";

import type { InboxItem } from "./inbox";
import {
  decideInboxToasts,
  isApprovalInboxItem,
  toastableInboxItems,
  type InboxToastState,
} from "./inbox-toast";

function row(partial: Partial<InboxItem> & Pick<InboxItem, "id">): InboxItem {
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
    persisted: true,
    ...partial,
  };
}

describe("toastableInboxItems", () => {
  it("keeps only unread persisted rows", () => {
    const items = [
      row({ id: "notif:1" }),
      row({ id: "notif:2", readAt: "2026-10-07T01:00:00.000Z" }),
      row({ id: "pr:1", persisted: false }),
    ];
    expect(toastableInboxItems(items).map((i) => i.id)).toEqual(["notif:1"]);
  });
});

describe("isApprovalInboxItem", () => {
  it("detects approval by title, category, or titleKey", () => {
    expect(
      isApprovalInboxItem({
        title: "Purchase request PR-1 needs your approval",
        category: "general",
        titleKey: null,
      }),
    ).toBe(true);
    expect(
      isApprovalInboxItem({ title: "Hello", category: "hr_leave", titleKey: null }),
    ).toBe(true);
    expect(
      isApprovalInboxItem({ title: "Hello", category: "general", titleKey: "inbox.prApprove" }),
    ).toBe(true);
    expect(
      isApprovalInboxItem({ title: "Chat reply", category: "chat", titleKey: null }),
    ).toBe(false);
  });
});

describe("decideInboxToasts", () => {
  const fresh: InboxToastState = { primed: false, seenIds: [] };

  it("does not toast on the first sample", () => {
    const first = decideInboxToasts(fresh, [row({ id: "notif:1" }), row({ id: "notif:2" })]);
    expect(first.toastIds).toEqual([]);
    expect(first.next.primed).toBe(true);
    expect(first.next.seenIds).toEqual(["notif:1", "notif:2"]);
  });

  it("toasts only newly arrived unread ids after baseline", () => {
    const primed = decideInboxToasts(fresh, [row({ id: "notif:1" })]).next;
    const next = decideInboxToasts(primed, [
      row({ id: "notif:1" }),
      row({ id: "notif:2", createdAt: "2026-10-08T00:00:00.000Z" }),
    ]);
    expect(next.toastIds).toEqual(["notif:2"]);
    expect(next.next.seenIds).toContain("notif:1");
    expect(next.next.seenIds).toContain("notif:2");
  });

  it("does not re-toast the same id on later polls", () => {
    const primed = decideInboxToasts(fresh, []).next;
    const once = decideInboxToasts(primed, [row({ id: "notif:9" })]);
    expect(once.toastIds).toEqual(["notif:9"]);
    const again = decideInboxToasts(once.next, [row({ id: "notif:9" })]);
    expect(again.toastIds).toEqual([]);
  });
});
