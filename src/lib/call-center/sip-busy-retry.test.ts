import { describe, expect, it } from "vitest";

import { isTransientPstnBusy } from "./pstn-busy";

describe("isTransientPstnBusy", () => {
  it("matches 486 / 503 style SIP failures", () => {
    expect(isTransientPstnBusy("SIP call failed: 486 User Busy (failed_precondition)")).toBe(true);
    expect(isTransientPstnBusy("SIP call failed: 503 Service Unavailable")).toBe(true);
    expect(isTransientPstnBusy("SIP call failed: 404 Not Found")).toBe(false);
  });
});
