import { describe, expect, it } from "vitest";

import { usesOpsCommandSubtitle } from "./topbar-identity";

describe("usesOpsCommandSubtitle", () => {
  it("keeps ops branding for exec/ops roles, not HR", () => {
    expect(usesOpsCommandSubtitle("ceo")).toBe(true);
    expect(usesOpsCommandSubtitle("duty_manager")).toBe(true);
    expect(usesOpsCommandSubtitle("hr")).toBe(false);
    expect(usesOpsCommandSubtitle("customer_service")).toBe(false);
  });
});
