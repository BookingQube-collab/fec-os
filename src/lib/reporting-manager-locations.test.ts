import { describe, expect, it } from "vitest";

import {
  attendanceLocationScopeMode,
  canSeeShiftRosterUpload,
  collectSrSiteSpanLocationIds,
  filterLocationsForFnbManagerScope,
  filterLocationsForJobTitleScope,
  isHeadOfficeLocation,
  isVenueOrSiteSupervisorManager,
  locationAccessIsCompanyWide,
  locationDiscoveryStaffIds,
  orgTitleForcesTeamLocationScope,
  rosterChartTeamIds,
  rosterTeamOrSelfStaffIds,
  unionTeamLocationIds,
  usesTeamLocationScope,
} from "./reporting-manager-locations";
import { attendanceListingIsCompanyWide } from "./attendance-listing-access";
import { FNB_MANAGER_VENUE_CODES } from "./supervisor-managed-venues";

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
    { id: "cbDsm", code: "CB-DSM", name: "Crayons & Bricks - Dar Al Salam Mall" },
    { id: "car", code: "CAR-AP", name: "Aspire Carousel" },
    { id: "ho-name", code: "HQ", name: "Head Office" },
  ];

  it("recognizes Head Office by code or name", () => {
    expect(isHeadOfficeLocation({ code: "HO", name: "Anything" })).toBe(true);
    expect(isHeadOfficeLocation({ code: "ho", name: null })).toBe(true);
    expect(isHeadOfficeLocation({ code: "HQ", name: "Head Office" })).toBe(true);
    expect(isHeadOfficeLocation({ code: "INF-CC", name: "Inflatapark" })).toBe(false);
  });

  it("treats HoO (Rajan) as company-wide like admin / Adil", () => {
    expect(attendanceLocationScopeMode("Head of Operations")).toBe("company");
    expect(attendanceLocationScopeMode("Head of Operations / FEC-IT")).toBe("company");
    expect(locationAccessIsCompanyWide(["cashier_host"], "Head of Operations")).toBe(true);
    expect(locationAccessIsCompanyWide(["ceo"], null)).toBe(true);
    expect(usesTeamLocationScope(["cashier_host"], "Head of Operations")).toBe(false);
  });

  it("keeps Sr. Site on team scope even when branch_gm has attendance.view (Mary)", () => {
    // Regression: branch_gm + INF-CC-only user_roles made chips All+INF-CC while
    // roster cards (admin loadViewerScopedTeamLocations) still listed UA-DM etc.
    expect(orgTitleForcesTeamLocationScope("Sr. Site Supervisor")).toBe(true);
    expect(locationAccessIsCompanyWide(["branch_gm"], "Sr. Site Supervisor")).toBe(false);
    expect(usesTeamLocationScope(["branch_gm"], "Sr. Site Supervisor")).toBe(true);
    expect(attendanceListingIsCompanyWide(["branch_gm"], "Sr. Site Supervisor")).toBe(false);
    expect(attendanceListingIsCompanyWide(["branch_gm"])).toBe(true);

    const discovery = locationDiscoveryStaffIds(
      "team_assigned_except_ho",
      "mary",
      ["ashfaq", "waqar", "rosebelt", "romel"],
    );
    expect(discovery).toEqual(["ashfaq", "mary", "romel", "rosebelt", "waqar"]);

    const people = [
      {
        staffId: "mary",
        locationId: "ho",
        workLocationIds: ["inf"],
        jobTitle: "Sr. Site Supervisor",
      },
      {
        staffId: "ashfaq",
        locationId: "kds",
        workLocationIds: ["inf", "car"],
        jobTitle: "Venue Supervisor",
      },
      {
        staffId: "waqar",
        locationId: "ua",
        workLocationIds: ["kdsMini", "inf"],
        jobTitle: "Venue Supervisor",
      },
      {
        staffId: "rosebelt",
        locationId: "cb",
        workLocationIds: [],
        jobTitle: "Venue Supervisor",
      },
      {
        staffId: "romel",
        locationId: "cbDsm",
        workLocationIds: [],
        jobTitle: "Venue Supervisor",
      },
    ];
    const span = collectSrSiteSpanLocationIds(people, discovery);
    const chips = filterLocationsForJobTitleScope(
      venues.filter((site) => span.includes(site.id)),
      "Sr. Site Supervisor",
    ).map((site) => site.code);
    expect(chips).toEqual(["INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM", "CB-DSM", "CAR-AP"]);
    expect(chips).not.toEqual(["INF-CC"]);
    expect(chips).toContain("UA-DM");
  });

  it("keeps Venue Supervisor on viewer-assigned scope under branch_gm (Waqar)", () => {
    expect(orgTitleForcesTeamLocationScope("Venue Supervisor", null, "venue_supervisor")).toBe(true);
    expect(locationAccessIsCompanyWide(["branch_gm"], "Venue Supervisor", null, "venue_supervisor")).toBe(
      false,
    );
    expect(attendanceListingIsCompanyWide(["branch_gm"], "Venue Supervisor", null, "venue_supervisor")).toBe(
      false,
    );
    expect(locationDiscoveryStaffIds("viewer_assigned", "waqar", ["crew-ua", "crew-cb"])).toEqual([
      "waqar",
    ]);
  });

  it("scopes Venue / Site Supervisor to viewer-assigned sites only", () => {
    expect(attendanceLocationScopeMode("Venue Supervisor")).toBe("viewer_assigned");
    expect(attendanceLocationScopeMode("Site Supervisor")).toBe("viewer_assigned");
    expect(attendanceLocationScopeMode("Cashier")).toBe("viewer_assigned");

    // Discovery uses Waqar alone — not the reporting tree — so CB never appears from crew.
    expect(
      locationDiscoveryStaffIds("viewer_assigned", "waqar", ["crew-inf", "crew-ua", "crew-cb"]),
    ).toEqual(["waqar"]);

    // Waqar estate includes INF-CC (mapped) in addition to UA-DM + KDS-DM.
    const waqarManaged = venues.filter(
      (site) => site.code === "UA-DM" || site.code === "KDS-DM" || site.code === "INF-CC",
    );
    expect(filterLocationsForJobTitleScope(waqarManaged, "Venue Supervisor").map((s) => s.code)).toEqual([
      "INF-CC",
      "UA-DM",
      "KDS-DM",
    ]);
  });

  it("scopes F&B Manager to INF-CC, KDS-CC, UA-DM", () => {
    expect(attendanceLocationScopeMode("F&B Manager", "F&B")).toBe("fnb_manager_venues");
    expect(filterLocationsForFnbManagerScope(venues, FNB_MANAGER_VENUE_CODES).map((s) => s.code)).toEqual([
      "INF-CC",
      "KDS-CC",
      "UA-DM",
    ]);
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
    ).toEqual(["INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM", "CB-DSM", "CAR-AP"]);
    expect(
      filterLocationsForJobTitleScope(venues, "Senior Site Supervisor").map((site) => site.code),
    ).toEqual(["INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM", "CB-DSM", "CAR-AP"]);
  });

  it("treats Venue/Site supervisors as venue managers but not Sr. Site", () => {
    expect(isVenueOrSiteSupervisorManager("Venue Supervisor", "venue_supervisor")).toBe(true);
    expect(isVenueOrSiteSupervisorManager("Site Supervisor", null)).toBe(true);
    expect(isVenueOrSiteSupervisorManager(null, "venue_supervisor")).toBe(true);
    expect(isVenueOrSiteSupervisorManager("Sr. Site Supervisor", "venue_supervisor")).toBe(false);
    expect(isVenueOrSiteSupervisorManager("Senior Site Supervisor", null)).toBe(false);
    expect(isVenueOrSiteSupervisorManager("Cashier", "cashier")).toBe(false);
  });

  it("gives Sr. Site chips only from people under her on the chart (Mary)", () => {
    const people = [
      {
        staffId: "mary",
        locationId: "ho",
        workLocationIds: ["inf"],
        jobTitle: "Sr. Site Supervisor",
        staffRole: "venue_supervisor",
      },
      {
        staffId: "ashfaq",
        locationId: "kds",
        workLocationIds: ["inf", "car"],
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      },
      {
        staffId: "waqar",
        locationId: "ua",
        workLocationIds: ["kdsMini", "inf"],
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      },
      {
        staffId: "rosebelt",
        locationId: "cb",
        workLocationIds: [],
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      },
      {
        staffId: "romel",
        locationId: "cbDsm",
        workLocationIds: [],
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      },
      {
        // Outside Mary's chart — must not appear on her chips.
        staffId: "winter-mirage",
        locationId: "ho-name",
        workLocationIds: [],
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      },
    ];

    const discovery = ["mary", "ashfaq", "waqar", "rosebelt", "romel"];
    const span = collectSrSiteSpanLocationIds(people, discovery);
    expect(span).toEqual(["car", "cb", "cbDsm", "ho", "inf", "kds", "kdsMini", "ua"]);
    expect(span).not.toContain("ho-name");

    const chips = filterLocationsForJobTitleScope(
      venues.filter((site) => span.includes(site.id)),
      "Sr. Site Supervisor",
    ).map((site) => site.code);
    expect(chips).toEqual(["INF-CC", "KDS-CC", "UA-DM", "KDS-DM", "CB-VM", "CB-DSM", "CAR-AP"]);
    expect(chips).not.toContain("HO");
    expect(chips).not.toContain("HQ");
  });

  it("keeps Venue Supervisor discovery on viewer only (Waqar)", () => {
    expect(
      locationDiscoveryStaffIds("viewer_assigned", "waqar", ["crew-inf", "crew-ua", "crew-cb"]),
    ).toEqual(["waqar"]);
  });
});

describe("team roster access", () => {
  it("limits location scope to logins without company roster or attendance access", () => {
    expect(usesTeamLocationScope(["cashier_host"])).toBe(true);
    expect(usesTeamLocationScope(["duty_manager"])).toBe(false);
    expect(usesTeamLocationScope(["hr"])).toBe(false);
    expect(usesTeamLocationScope([])).toBe(true);
    expect(usesTeamLocationScope(["cashier_host"], "Head of Operations")).toBe(false);
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
