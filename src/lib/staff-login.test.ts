import { describe, expect, it } from "vitest";

import { resolveStaffLoginEmail } from "@/lib/staff-login";

describe("resolveStaffLoginEmail", () => {
  it("uses a valid staff email, lowercased", () => {
    expect(resolveStaffLoginEmail("Agnes@Example.com", "INF-CC-STF16")).toBe("agnes@example.com");
  });

  it("builds a sign-in email from the employee code when staff email is missing", () => {
    expect(resolveStaffLoginEmail(null, "INF-CC-STF16")).toBe("inf.cc.stf16@fec.qa");
    expect(resolveStaffLoginEmail("n/a", "E3 1001")).toBe("e3.1001@fec.qa");
  });
});
