import { describe, expect, it } from "vitest";

import {
  planStaffLoginEmailSync,
  resolveStaffPayslipEmail,
} from "@/lib/staff-login-email-sync";

describe("planStaffLoginEmailSync", () => {
  const authByEmail = new Map<string, string>([
    ["old@fec.qa", "user-1"],
    ["taken@fec.qa", "user-other"],
  ]);

  it("skips staff without a login", () => {
    expect(
      planStaffLoginEmailSync(
        { staffId: "s1", userId: null, staffEmail: "a@fec.qa", authEmail: null },
        authByEmail,
      ),
    ).toEqual({ action: "skip_no_login" });
  });

  it("skips when already matched", () => {
    expect(
      planStaffLoginEmailSync(
        {
          staffId: "s1",
          userId: "user-1",
          staffEmail: "old@fec.qa",
          authEmail: "old@fec.qa",
        },
        authByEmail,
      ),
    ).toEqual({ action: "skip_already_matched", email: "old@fec.qa" });
  });

  it("plans an auth update when roster email differs", () => {
    expect(
      planStaffLoginEmailSync(
        {
          staffId: "s1",
          userId: "user-1",
          staffEmail: "new@fec.qa",
          authEmail: "old@fec.qa",
        },
        authByEmail,
      ),
    ).toEqual({
      action: "update_auth",
      email: "new@fec.qa",
      previousEmail: "old@fec.qa",
    });
  });

  it("reports conflict when another auth user owns the target email", () => {
    expect(
      planStaffLoginEmailSync(
        {
          staffId: "s1",
          userId: "user-1",
          staffEmail: "taken@fec.qa",
          authEmail: "old@fec.qa",
        },
        authByEmail,
      ),
    ).toEqual({
      action: "conflict_taken",
      email: "taken@fec.qa",
      takenByUserId: "user-other",
    });
  });
});

describe("resolveStaffPayslipEmail", () => {
  it("returns lowercased roster email", () => {
    expect(resolveStaffPayslipEmail("  Rajan@FEC.qa ")).toBe("rajan@fec.qa");
  });

  it("returns null for blank or invalid", () => {
    expect(resolveStaffPayslipEmail(null)).toBeNull();
    expect(resolveStaffPayslipEmail("not-an-email")).toBeNull();
  });
});
