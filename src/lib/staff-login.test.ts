import { describe, expect, it } from "vitest";

import { chooseStaffLoginEmail, resolveStaffLoginEmail, staffLoginEmailCandidates } from "@/lib/staff-login";

describe("resolveStaffLoginEmail", () => {
  it("uses a valid staff email, lowercased", () => {
    expect(resolveStaffLoginEmail("Agnes@Example.com", "INF-CC-STF16")).toBe("agnes@example.com");
    expect(resolveStaffLoginEmail("Agnes@Example.com", "S43", { fullName: "Sarah Oxel" })).toBe(
      "agnes@example.com",
    );
  });

  it("builds a sign-in email from the employee code when staff email and name are missing", () => {
    expect(resolveStaffLoginEmail(null, "INF-CC-STF16")).toBe("inf.cc.stf16@fec.qa");
    expect(resolveStaffLoginEmail("n/a", "E3 1001")).toBe("e3.1001@fec.qa");
  });

  it("builds the login from the first name", () => {
    expect(resolveStaffLoginEmail(null, "S43", { fullName: "Sarah Oxel" })).toBe("sarah@fec.qa");
    expect(resolveStaffLoginEmail("n/a", "S43", { fullName: "  Sarah   Oxel " })).toBe("sarah@fec.qa");
  });

  it("uses first and last name when the first name is already taken", () => {
    expect(
      resolveStaffLoginEmail(null, "S43", {
        fullName: "Sarah Oxel",
        takenEmails: ["sarah@fec.qa"],
      }),
    ).toBe("sarah.oxel@fec.qa");
    expect(
      resolveStaffLoginEmail(null, "S44", {
        fullName: "Sarah Jones",
        takenEmails: ["Sarah@FEC.qa"],
      }),
    ).toBe("sarah.jones@fec.qa");
  });

  it("appends a numeric suffix when first and last name are both taken", () => {
    expect(
      resolveStaffLoginEmail(null, "S45", {
        fullName: "Sarah Oxel",
        takenEmails: ["sarah@fec.qa", "sarah.oxel@fec.qa"],
      }),
    ).toBe("sarah.oxel2@fec.qa");
  });

  it("suffixes a single name when that login is taken", () => {
    expect(
      resolveStaffLoginEmail(null, "S43", {
        fullName: "Sarah",
        takenEmails: ["sarah@fec.qa"],
      }),
    ).toBe("sarah2@fec.qa");
  });

  it("normalizes spaces and special characters the same way as employee codes", () => {
    expect(staffLoginEmailCandidates("Mary-Jane O'Neil").slice(0, 2)).toEqual([
      "mary.jane@fec.qa",
      "mary.jane.o.neil@fec.qa",
    ]);
    expect(resolveStaffLoginEmail(null, "S43", { fullName: "Mary-Jane O'Neil" })).toBe("mary.jane@fec.qa");
  });

  it("falls back to the employee code when the name has no latin letters", () => {
    expect(resolveStaffLoginEmail(null, "S43", { fullName: "سارة" })).toBe("s43@fec.qa");
  });

  it("does not walk backwards when a later generated email is taken", () => {
    expect(
      chooseStaffLoginEmail({
        fullName: "Sarah Oxel",
        employeeCode: "S43",
        takenEmails: ["sarah.oxel@fec.qa"],
        fromEmail: "sarah.oxel@fec.qa",
      }),
    ).toBe("sarah.oxel2@fec.qa");
  });
});
