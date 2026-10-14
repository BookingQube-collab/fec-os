import { describe, expect, it } from "vitest";

import {
  chooseStaffLoginEmail,
  generateStaffLoginPassword,
  isStaffLoginPassword,
  orgChartCreateLoginRequest,
  prefillOrgChartLoginEmail,
  resolveStaffLoginEmail,
  staffLoginEmailCandidates,
} from "@/lib/staff-login";

const EASY_PASSWORD = /^[a-z]+-[a-z]+-\d{4}$/;

describe("generateStaffLoginPassword", () => {
  it("is easy to read, unique across many calls, and meets the login password rules", () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const password = generateStaffLoginPassword();
      expect(password).toMatch(EASY_PASSWORD);
      expect(isStaffLoginPassword(password)).toBe(true);
      expect(password).not.toBe("Demo@FEC2026!");
      const [first, second, digits] = password.split("-");
      expect(first).not.toBe(second);
      expect(digits).toHaveLength(4);
      passwords.add(password);
    }
    expect(passwords.size).toBe(40);
  });
});

describe("isStaffLoginPassword", () => {
  it("accepts 8 to 128 characters and rejects anything outside that", () => {
    expect(isStaffLoginPassword(generateStaffLoginPassword())).toBe(true);
    expect(isStaffLoginPassword("1234567")).toBe(false);
    expect(isStaffLoginPassword("a".repeat(128))).toBe(true);
    expect(isStaffLoginPassword("a".repeat(129))).toBe(false);
  });
});

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
});

describe("org chart create login email", () => {
  it("prefills a stored staff email and leaves a blank when none is saved", () => {
    expect(prefillOrgChartLoginEmail("  Agnes@Example.com  ")).toBe("Agnes@Example.com");
    expect(prefillOrgChartLoginEmail(null)).toBe("");
    expect(prefillOrgChartLoginEmail(undefined)).toBe("");
    expect(prefillOrgChartLoginEmail("   ")).toBe("");
  });

  it("requires a normal email and keeps the edited address for the login", () => {
    const password = generateStaffLoginPassword();
    expect(
      orgChartCreateLoginRequest({ staffId: "staff-1", email: "  Agnes@Example.com ", password }),
    ).toEqual({ ok: true, staffId: "staff-1", email: "agnes@example.com", password });
    expect(orgChartCreateLoginRequest({ staffId: "staff-1", email: "", password })).toEqual({
      ok: false,
      emailError: true,
      passwordError: false,
    });
    expect(orgChartCreateLoginRequest({ staffId: "staff-1", email: "n/a", password })).toMatchObject({
      ok: false,
      emailError: true,
    });
    expect(orgChartCreateLoginRequest({ staffId: "staff-1", email: "not-an-email", password })).toMatchObject({
      ok: false,
      emailError: true,
    });
    expect(orgChartCreateLoginRequest({ staffId: "staff-1", email: "agnes@example.com", password: "short" })).toEqual({
      ok: false,
      emailError: false,
      passwordError: true,
    });
  });
});

describe("chooseStaffLoginEmail", () => {
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
