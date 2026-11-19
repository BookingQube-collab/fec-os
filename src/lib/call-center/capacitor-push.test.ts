import { describe, expect, it } from "vitest";

import {
  clearCallCenterDeepLinkParams,
  readCallCenterDeepLinkCallId,
} from "./capacitor-push";

describe("readCallCenterDeepLinkCallId", () => {
  it("reads callId and offer query params", () => {
    expect(
      readCallCenterDeepLinkCallId("?callId=11111111-1111-4111-8111-111111111111"),
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(
      readCallCenterDeepLinkCallId("?offer=22222222-2222-4222-8222-222222222222"),
    ).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("rejects non-uuid values", () => {
    expect(readCallCenterDeepLinkCallId("?callId=not-a-uuid")).toBeNull();
    expect(readCallCenterDeepLinkCallId("")).toBeNull();
  });
});

describe("clearCallCenterDeepLinkParams", () => {
  it("is a no-op without window history when search is empty-safe", () => {
    expect(() => clearCallCenterDeepLinkParams()).not.toThrow();
  });
});
