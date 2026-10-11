import { describe, expect, it } from "vitest";

import {
  canSeeShiftRosterUpload,
  rosterTeamOrSelfStaffIds,
  unionTeamLocationIds,
  usesTeamLocationScope,
} from "./reporting-manager-locations";

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

  it("lets a supervisor with zero reports upload only their own roster", () => {
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Site Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Sr. Site Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "F&B Manager")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, null, "venue_supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Cashier")).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Cashier / Host")).toBe(false);
    expect(canSeeShiftRosterUpload(["technician"], false, "Technician")).toBe(false);
    expect(canSeeShiftRosterUpload(["technician"], false, null, "crew")).toBe(false);

    expect(
      rosterTeamOrSelfStaffIds({
        staffId: "self",
        directReportStaffIds: [],
        jobTitle: "Site Supervisor",
      }),
    ).toEqual(["self"]);
    expect(
      rosterTeamOrSelfStaffIds({
        staffId: "self",
        directReportStaffIds: [],
        jobTitle: "Attendant",
        staffRole: "venue_supervisor",
      }),
    ).toEqual(["self"]);
    expect(
      rosterTeamOrSelfStaffIds({
        staffId: "cashier",
        directReportStaffIds: [],
        jobTitle: "Cashier",
        staffRole: "cashier",
      }),
    ).toEqual([]);
    expect(
      rosterTeamOrSelfStaffIds({
        staffId: null,
        directReportStaffIds: [],
        jobTitle: "Site Supervisor",
      }),
    ).toEqual([]);
    expect(
      rosterTeamOrSelfStaffIds({
        staffId: "supervisor",
        directReportStaffIds: ["report-a", "report-b"],
        jobTitle: "Site Supervisor",
      }),
    ).toEqual(["report-a", "report-b"]);
  });
});
