import { describe, expect, it } from "vitest";

import { resolveFaceEnrollmentTarget } from "./face-enrollment";

describe("resolveFaceEnrollmentTarget", () => {
  it("blocks enroll when login has no staff link and no staffId", () => {
    expect(
      resolveFaceEnrollmentTarget({
        linkedStaffId: null,
        requestedStaffId: null,
        canEnrollOthers: true,
      }),
    ).toEqual({ ok: false, reason: "no_staff" });
  });

  it("uses linked staff for self enroll", () => {
    expect(
      resolveFaceEnrollmentTarget({
        linkedStaffId: "11111111-1111-1111-1111-111111111111",
        requestedStaffId: null,
        canEnrollOthers: false,
      }),
    ).toEqual({
      ok: true,
      staffId: "11111111-1111-1111-1111-111111111111",
      editingOther: false,
    });
  });

  it("allows HR to enroll another staff when permitted", () => {
    expect(
      resolveFaceEnrollmentTarget({
        linkedStaffId: null,
        requestedStaffId: "22222222-2222-2222-2222-222222222222",
        canEnrollOthers: true,
      }),
    ).toEqual({
      ok: true,
      staffId: "22222222-2222-2222-2222-222222222222",
      editingOther: true,
    });
  });

  it("forbids enrolling another staff without permission", () => {
    expect(
      resolveFaceEnrollmentTarget({
        linkedStaffId: "11111111-1111-1111-1111-111111111111",
        requestedStaffId: "22222222-2222-2222-2222-222222222222",
        canEnrollOthers: false,
      }),
    ).toEqual({ ok: false, reason: "forbidden_other" });
  });
});
