import { describe, expect, it } from "vitest";

import {
  canSeeShiftRosterUpload,
  rosterChartTeamIds,
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

  it("shows the shift roster option to venue, sr. site, and F&B supervisors, and to the CEO and GM", () => {
    expect(canSeeShiftRosterUpload(["cashier_host"], true)).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], true, "Team Leader")).toBe(false);
    expect(canSeeShiftRosterUpload(["duty_manager"], false)).toBe(false);
    expect(canSeeShiftRosterUpload(["hr"], false)).toBe(false);
    expect(canSeeShiftRosterUpload(["technician"], false)).toBe(false);
    expect(canSeeShiftRosterUpload(["ceo"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["branch_gm"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "General Manager")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Managing Director")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Managing Director / Chief Executive Officer")).toBe(true);
    expect(canSeeShiftRosterUpload(["hr"], false, "Head of Operations")).toBe(false);
  });

  it("lets a supervisor with zero reports upload only their own roster", () => {
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Site Supervisor")).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "F&B Manager")).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Sr. Site Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "F&B Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Venue Supervisor")).toBe(true);
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

describe("rosterChartTeamIds", () => {
  const chart = [
    { staffId: "mary", reportingManagerStaffId: "rajan" },
    { staffId: "ashfaq", reportingManagerStaffId: "mary" },
    { staffId: "ma-luz", reportingManagerStaffId: "ashfaq" },
    { staffId: "marissa", reportingManagerStaffId: "ashfaq" },
    { staffId: "flora", reportingManagerStaffId: "ashfaq" },
    { staffId: "kds-crew", reportingManagerStaffId: "ma-luz" },
    { staffId: "inflata-crew", reportingManagerStaffId: "marissa" },
    { staffId: "ruben", reportingManagerStaffId: "gm" },
    { staffId: "barista", reportingManagerStaffId: "ruben" },
    { staffId: "abiola", reportingManagerStaffId: "ashfaq", assignable: false },
    { staffId: "joker-crew", reportingManagerStaffId: "ma-luz", assignable: false },
  ];

  it("includes the viewer and everyone under them on the chart", () => {
    expect(rosterChartTeamIds("mary", chart)).toEqual([
      "ashfaq",
      "flora",
      "inflata-crew",
      "kds-crew",
      "ma-luz",
      "marissa",
      "mary",
    ]);
    expect(rosterChartTeamIds("ashfaq", chart)).toEqual([
      "ashfaq",
      "flora",
      "inflata-crew",
      "kds-crew",
      "ma-luz",
      "marissa",
    ]);
    expect(rosterChartTeamIds("ma-luz", chart)).toEqual(["kds-crew", "ma-luz"]);
    expect(rosterChartTeamIds("marissa", chart)).toEqual(["inflata-crew", "marissa"]);
    expect(rosterChartTeamIds("ruben", chart)).toEqual(["barista", "ruben"]);
    expect(rosterChartTeamIds("kds-crew", chart)).toEqual(["kds-crew"]);
  });

  it("keeps walking through someone the roster cannot list", () => {
    const throughClosedLead = [
      { staffId: "mary", reportingManagerStaffId: "rajan" },
      { staffId: "closed-lead", reportingManagerStaffId: "mary", assignable: false },
      { staffId: "crew", reportingManagerStaffId: "closed-lead" },
    ];
    expect(rosterChartTeamIds("mary", throughClosedLead)).toEqual(["crew", "mary"]);
    expect(rosterChartTeamIds(null, chart)).toEqual([]);
  });
});
