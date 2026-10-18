import { describe, expect, it } from "vitest";

import {
  attendanceLocationScopeMode,
  canSeeShiftRosterUpload,
  filterLocationsForJobTitleScope,
  isHeadOfficeLocation,
  locationDiscoveryStaffIds,
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

describe("attendance location scope (org chart)", () => {
  const venues = [
    { id: "ho", code: "HO", name: "Head Office" },
    { id: "inf", code: "INF-CC", name: "Inflatapark - City Center" },
    { id: "kds", code: "KDS-CC", name: "Kids Driving School - City Center" },
    { id: "ua", code: "UA-DM", name: "Urban Arena - Doha Mall" },
    { id: "kdsMini", code: "KDS-DM", name: "Kids Driving School Mini - Doha Mall" },
    { id: "cb", code: "CB-VM", name: "Crayons & Bricks - Vendome Mall" },
    { id: "ho-name", code: "HQ", name: "Head Office" },
  ];

  it("recognizes Head Office by code or name", () => {
    expect(isHeadOfficeLocation({ code: "HO", name: "Anything" })).toBe(true);
    expect(isHeadOfficeLocation({ code: "ho", name: null })).toBe(true);
    expect(isHeadOfficeLocation({ code: "HQ", name: "Head Office" })).toBe(true);
    expect(isHeadOfficeLocation({ code: "INF-CC", name: "Inflatapark" })).toBe(false);
  });

  it("scopes Venue / Site Supervisor to viewer-assigned sites only (Waqar: UA-DM + KDS-DM)", () => {
    expect(attendanceLocationScopeMode("Venue Supervisor")).toBe("viewer_assigned");
    expect(attendanceLocationScopeMode("Site Supervisor")).toBe("viewer_assigned");
    expect(attendanceLocationScopeMode("Cashier")).toBe("viewer_assigned");

    // Discovery uses Waqar alone — not the reporting tree — so INF/KDS-CC/CB never appear.
    expect(
      locationDiscoveryStaffIds("viewer_assigned", "waqar", ["crew-inf", "crew-ua", "crew-cb"]),
    ).toEqual(["waqar"]);

    const waqarManaged = venues.filter((site) => site.code === "UA-DM" || site.code === "KDS-DM");
    expect(filterLocationsForJobTitleScope(waqarManaged, "Venue Supervisor").map((s) => s.code)).toEqual([
      "UA-DM",
      "KDS-DM",
    ]);
    // Even if a bad coverage list leaked in, Venue Supervisor does not strip by title —
    // callers must not pass punch-expanded sites. Discovery above keeps the list to Waqar.
    expect(
      filterLocationsForJobTitleScope(venues, "Venue Supervisor").map((site) => site.code),
    ).toEqual(["HO", "INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM", "HQ"]);
  });

  it("scopes Sr. Site to team assigned sites and drops Head Office (Mary)", () => {
    expect(attendanceLocationScopeMode("Sr. Site Supervisor")).toBe("team_assigned_except_ho");
    expect(attendanceLocationScopeMode("Senior Site Supervisor")).toBe("team_assigned_except_ho");
    expect(attendanceLocationScopeMode(null, "Sr. Site Supervisor")).toBe("team_assigned_except_ho");

    expect(
      locationDiscoveryStaffIds("team_assigned_except_ho", "mary", ["ashfaq", "ma-luz"]),
    ).toEqual(["ashfaq", "ma-luz", "mary"]);

    expect(
      filterLocationsForJobTitleScope(venues, "Sr. Site Supervisor").map((site) => site.code),
    ).toEqual(["INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM"]);
    expect(
      filterLocationsForJobTitleScope(venues, "Senior Site Supervisor").map((site) => site.code),
    ).toEqual(["INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM"]);
  });
});

describe("team roster access", () => {
  it("limits location scope to logins without company roster or attendance access", () => {
    expect(usesTeamLocationScope(["cashier_host"])).toBe(true);
    expect(usesTeamLocationScope(["duty_manager"])).toBe(false);
    expect(usesTeamLocationScope(["hr"])).toBe(false);
    expect(usesTeamLocationScope([])).toBe(true);
  });

  it("shows the shift roster option to supervisors and every people.edit_roster login", () => {
    expect(canSeeShiftRosterUpload(["cashier_host"], true)).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], true, "Team Leader")).toBe(false);
    expect(canSeeShiftRosterUpload(["duty_manager"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["hr"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["technician"], false)).toBe(false);
    expect(canSeeShiftRosterUpload(["ceo"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["branch_gm"], false)).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "General Manager")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Managing Director")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Managing Director / Chief Executive Officer")).toBe(true);
    expect(canSeeShiftRosterUpload(["hr"], false, "Head of Operations")).toBe(true);
  });

  it("lets a supervisor with zero reports upload only their own roster", () => {
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Site Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "F&B Manager")).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Sr. Site Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "F&B Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Venue Supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, null, "venue_supervisor")).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Cashier")).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Cashier / Host")).toBe(false);
    expect(canSeeShiftRosterUpload(["technician"], false, "Technician")).toBe(false);
    expect(canSeeShiftRosterUpload(["technician"], false, null, "crew")).toBe(false);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Operations Manager", null, null, true)).toBe(
      true,
    );
    // Russell: Technician under HoO (not Manager/Lead title).
    expect(
      canSeeShiftRosterUpload(["technician"], false, "Technician", "technician", "Maintenance", true),
    ).toBe(true);
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Operations Manager", null, null, false)).toBe(
      false,
    );
    expect(canSeeShiftRosterUpload(["cashier_host"], false, "Cashier", null, null, true)).toBe(false);

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
        jobTitle: "Operations Supervisor",
      }),
    ).toEqual(["self"]);
    expect(
      rosterTeamOrSelfStaffIds({
        staffId: "russell",
        directReportStaffIds: [],
        jobTitle: "Technician",
        staffRole: "technician",
        department: "Maintenance",
        reportsToHeadOfOperations: true,
      }),
    ).toEqual(["russell"]);
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
        staffId: "cashier",
        directReportStaffIds: [],
        jobTitle: "Cashier",
        reportsToHeadOfOperations: true,
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
