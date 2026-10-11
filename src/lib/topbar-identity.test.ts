import { describe, expect, it } from "vitest";

import { topbarIdentityLabel, usesOpsCommandSubtitle } from "./topbar-identity";

describe("usesOpsCommandSubtitle", () => {
  it("keeps ops branding for exec/ops roles, not HR", () => {
    expect(usesOpsCommandSubtitle("ceo")).toBe(true);
    expect(usesOpsCommandSubtitle("duty_manager")).toBe(true);
    expect(usesOpsCommandSubtitle("hr")).toBe(false);
    expect(usesOpsCommandSubtitle("customer_service")).toBe(false);
  });
});

describe("topbarIdentityLabel", () => {
  it("shows the staff job title when the linked row has one", () => {
    expect(topbarIdentityLabel("F&B Manager", "Cashier / Host")).toBe("F&B Manager");
  });

  it("keeps the login role label when there is no staff job title", () => {
    expect(topbarIdentityLabel(null, "Cashier / Host")).toBe("Cashier / Host");
    expect(topbarIdentityLabel("  ", "Duty Manager")).toBe("Duty Manager");
  });
});
