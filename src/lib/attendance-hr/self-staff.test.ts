import { describe, expect, it } from "vitest";

import { resolveSelfStaffId } from "./self-staff";

describe("employee check-in authz", () => {
  it("allows a linked staff member to check in as themselves", () => {
    expect(resolveSelfStaffId({ linkedStaffId: "staff-1" })).toBe("staff-1");
    expect(resolveSelfStaffId({ linkedStaffId: "staff-1", requestedStaffId: "staff-1" })).toBe("staff-1");
  });

  it("blocks check-in when the login is not linked to staff", () => {
    expect(() => resolveSelfStaffId({ linkedStaffId: null })).toThrow(/not linked/);
  });

  it("blocks checking in as another employee", () => {
    expect(() =>
      resolveSelfStaffId({ linkedStaffId: "staff-1", requestedStaffId: "staff-2" }),
    ).toThrow(/only check in as yourself/);
  });
});
