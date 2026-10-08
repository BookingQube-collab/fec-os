import { describe, expect, it } from "vitest";

import { canSeeShiftRosterUpload, unionTeamLocationIds, usesTeamLocationScope } from "./reporting-manager-locations";

describe("unionTeamLocationIds", () => {
  it("keeps every site the team is assigned to or punches at", () => {
    expect(
      unionTeamLocationIds({
        homeLocationIds: ["ho", null, ""],
        workLocationIds: ["ua-dm"],
        punchLocationIds: ["kds-cc", "ua-dm", undefined],
        rosterLocationIds: ["inf-cc"],
      }),
    ).toEqual(["ho", "inf-cc", "kds-cc", "ua-dm"]);
  });

  it("does not invent a site when the team has no locations", () => {
    expect(unionTeamLocationIds({ homeLocationIds: [null], punchLocationIds: [] })).toEqual([]);
  });
});

describe("team roster access", () => {
  it("limits location scope to logins without company roster or attendance access", () => {
    expect(usesTeamLocationScope(["cashier_host"])).toBe(true);
    expect(usesTeamLocationScope(["duty_manager"])).toBe(false);
    expect(usesTeamLocationScope(["hr"])).toBe(false);
    expect(usesTeamLocationScope([])).toBe(true);
  });

  it("shows shift roster upload to reporting managers and supervisors only", () => {
    expect(canSeeShiftRosterUpload(["cashier_host"], true)).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false)).toBe(false);
    expect(canSeeShiftRosterUpload(["duty_manager"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["branch_gm"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["tech_supervisor"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["technician"], false)).toBe(false);
  });
});
