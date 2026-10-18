import { describe, expect, it } from "vitest";

import { decideInboxAlert, isInboxSoundMuted, type InboxAlertState } from "./inbox-alert";

describe("decideInboxAlert", () => {
  const fresh: InboxAlertState = { primed: false, lastUnread: 0 };

  it("does not alert on the first sample even when unread is already high", () => {
    const first = decideInboxAlert(fresh, 3);
    expect(first.shouldAlert).toBe(false);
    expect(first.next).toEqual({ primed: true, lastUnread: 3 });
  });

  it("alerts when unread increases after the baseline", () => {
    const primed = decideInboxAlert(fresh, 1).next;
    const next = decideInboxAlert(primed, 2);
    expect(next.shouldAlert).toBe(true);
    expect(next.next.lastUnread).toBe(2);
  });

  it("does not alert when unread stays the same or drops", () => {
    const primed = decideInboxAlert(fresh, 2).next;
    expect(decideInboxAlert(primed, 2).shouldAlert).toBe(false);
    expect(decideInboxAlert(primed, 1).shouldAlert).toBe(false);
  });
});

describe("isInboxSoundMuted", () => {
  it("defaults to unmuted", () => {
    expect(isInboxSoundMuted({ getItem: () => null })).toBe(false);
  });

  it("respects the local mute flag", () => {
    expect(isInboxSoundMuted({ getItem: () => "1" })).toBe(true);
  });
});
