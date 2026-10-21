import { describe, expect, it } from "vitest";

import {
  attendanceListingIsCompanyWide,
  attendanceListingTeamStaffIds,
  attendanceMappingIsCompanyWide,
  attendanceMappingRowAllowed,
  attendanceMappingStaffAllowed,
  canMergeAttendanceMappings,
  canSeeAttendanceListing,
  canSeeAttendanceMapping,
  reportingTreeStaffIds,
  resolveAttendanceListingStaffConstraint,
  visibleAttendanceNavHrefs,
} from "./attendance-listing-access";

describe("attendance listing access", () => {
  it("keeps company-wide listing for admin, GM, CEO, and COO", () => {
    for (const role of ["hr", "branch_gm", "ceo", "coo", "regional_ops", "auditor", "cfo"] as const) {
      expect(attendanceListingIsCompanyWide([role])).toBe(true);
      expect(canSeeAttendanceListing([role], false)).toBe(true);
    }
  });

  it("treats Head of Operations as company-wide even on a floor role", () => {
    expect(attendanceListingIsCompanyWide(["cashier_host"], "Head of Operations")).toBe(true);
    expect(attendanceListingIsCompanyWide(["cashier_host"], "Head of Operations / FEC-IT")).toBe(true);
    expect(canSeeAttendanceListing(["cashier_host"], false, "Head of Operations")).toBe(true);
    expect(visibleAttendanceNavHrefs(["cashier_host"], false, "Head of Operations")).toContain(
      "/people/attendance/reports",
    );
    expect(visibleAttendanceNavHrefs(["cashier_host"], false, "Head of Operations")).toContain(
      "/people/attendance/import",
    );
  });

  it("shows the listing to managers, supervisors, and reporting team leaders", () => {
    expect(canSeeAttendanceListing(["duty_manager"], false)).toBe(true);
    expect(canSeeAttendanceListing(["tech_supervisor"], false)).toBe(true);
    expect(canSeeAttendanceListing(["cashier_host"], true)).toBe(true);
    expect(canSeeAttendanceListing(["technician"], true)).toBe(true);
    expect(canSeeAttendanceListing(["customer_service"], true)).toBe(true);
  });

  it("does not open the listing for a front-line login with no team", () => {
    expect(canSeeAttendanceListing(["cashier_host"], false)).toBe(false);
    expect(canSeeAttendanceListing(["technician"], false)).toBe(false);
    expect(attendanceListingIsCompanyWide(["cashier_host"])).toBe(false);
    expect(attendanceListingIsCompanyWide(["duty_manager"])).toBe(true);
  });

  it("adds listing and mapping without import or device admin", () => {
    expect(visibleAttendanceNavHrefs(["cashier_host"], true)).toEqual([
      "/people/attendance",
      "/people/attendance/reports",
      "/people/attendance/mapping",
      "/people/attendance/corrections",
    ]);
    expect(visibleAttendanceNavHrefs(["cashier_host"], true)).not.toContain("/people/attendance/import");
    expect(visibleAttendanceNavHrefs(["cashier_host"], true)).not.toContain("/people/attendance/device-logs");
    expect(visibleAttendanceNavHrefs(["cashier_host"], true)).not.toContain("/people/attendance/settings");
    expect(visibleAttendanceNavHrefs(["cashier_host"], false)).toEqual([
      "/people/attendance",
      "/people/attendance/corrections",
    ]);
    expect(visibleAttendanceNavHrefs(["hr"], false)).toEqual([
      "/people/attendance",
      "/people/attendance/import",
      "/people/attendance/reports",
      "/people/attendance/mapping",
      "/people/attendance/device-logs",
      "/people/attendance/corrections",
      "/people/attendance/settings",
    ]);
    expect(visibleAttendanceNavHrefs(["branch_gm"], false)).toContain("/people/attendance/import");
    expect(visibleAttendanceNavHrefs(["duty_manager"], false)).toContain("/people/attendance/reports");
  });

  it("limits rows to the reporting tree and drops people outside it", () => {
    expect(
      reportingTreeStaffIds(
        "ruben",
        ["host-a"],
        [
          { staffId: "host-a", reportingManagerStaffId: "ruben" },
          { staffId: "runner", reportingManagerStaffId: "host-a" },
          { staffId: "other", reportingManagerStaffId: "gm" },
          { staffId: "ruben", reportingManagerStaffId: "gm" },
        ],
      ),
    ).toEqual(["host-a", "runner"]);

    expect(reportingTreeStaffIds("ruben", [], [])).toEqual([]);

    expect(
      resolveAttendanceListingStaffConstraint({
        companyWide: false,
        teamStaffIds: ["host-a", "runner"],
        narrowToStaffIds: ["host-a", "other"],
        unmappedOnly: false,
      }),
    ).toEqual({ mode: "team", staffIds: ["host-a"] });

    expect(
      resolveAttendanceListingStaffConstraint({
        companyWide: false,
        teamStaffIds: ["host-a"],
        narrowToStaffIds: null,
        unmappedOnly: true,
      }),
    ).toEqual({ mode: "empty" });

    expect(
      resolveAttendanceListingStaffConstraint({
        companyWide: true,
        teamStaffIds: ["host-a"],
        narrowToStaffIds: ["other"],
        unmappedOnly: false,
      }),
    ).toEqual({ mode: "company" });
  });

  it("unions the viewer onto the listing set for supervisors and managers (Waqar / Mary)", () => {
    const tree = ["crew-a", "host-a"];
    expect(
      attendanceListingTeamStaffIds({
        viewerStaffId: "waqar",
        viewerJobTitle: "Venue Supervisor",
        viewerStaffRole: "venue_supervisor",
        reportingTreeStaffIds: tree,
      }),
    ).toEqual(["crew-a", "host-a", "waqar"]);

    expect(
      attendanceListingTeamStaffIds({
        viewerStaffId: "mary",
        viewerJobTitle: "Sr. Site Supervisor",
        viewerStaffRole: "venue_supervisor",
        reportingTreeStaffIds: ["ashfaq", "marissa"],
      }),
    ).toEqual(["ashfaq", "marissa", "mary"]);

    expect(
      attendanceListingTeamStaffIds({
        viewerStaffId: "ops-mgr",
        viewerJobTitle: "Operations Manager",
        reportingTreeStaffIds: ["lead"],
      }),
    ).toEqual(["lead", "ops-mgr"]);

    expect(
      attendanceListingTeamStaffIds({
        viewerStaffId: "fb-mgr",
        viewerJobTitle: "F&B Manager",
        reportingTreeStaffIds: [],
      }),
    ).toEqual(["fb-mgr"]);
  });

  it("keeps cashier team leaders on reports only (no self on listing)", () => {
    expect(
      attendanceListingTeamStaffIds({
        viewerStaffId: "cashier-lead",
        viewerJobTitle: "Cashier",
        viewerStaffRole: "cashier",
        reportingTreeStaffIds: ["helper"],
      }),
    ).toEqual(["helper"]);
  });
});

describe("attendance mapping access", () => {
  it("shows mapping to the same managers and team leaders, and keeps company mappers", () => {
    expect(canSeeAttendanceMapping(["cashier_host"], true)).toBe(true);
    expect(canSeeAttendanceMapping(["duty_manager"], false)).toBe(true);
    expect(canSeeAttendanceMapping(["tech_supervisor"], false)).toBe(true);
    expect(canSeeAttendanceMapping(["hr"], false)).toBe(true);
    expect(canSeeAttendanceMapping(["branch_gm"], false)).toBe(true);
    expect(canSeeAttendanceMapping(["ceo"], false)).toBe(true);
    expect(canSeeAttendanceMapping(["coo"], false)).toBe(true);
    expect(canSeeAttendanceMapping(["cashier_host"], false)).toBe(false);
  });

  it("keeps company mapping edit for CEO/HR/GM, and supervisor identity edit for everyone else", () => {
    expect(attendanceMappingIsCompanyWide(["hr"])).toBe(true);
    expect(attendanceMappingIsCompanyWide(["ceo"])).toBe(true);
    expect(attendanceMappingIsCompanyWide(["coo"])).toBe(true);
    expect(attendanceMappingIsCompanyWide(["branch_gm"])).toBe(true);
    expect(attendanceMappingIsCompanyWide(["duty_manager"])).toBe(false);
    expect(attendanceMappingIsCompanyWide(["cashier_host"])).toBe(false);

    // Adil (CEO / Managing Director) must merge without a venue-supervisor staff title.
    expect(
      canMergeAttendanceMappings(["ceo"], false, {
        jobTitle: "Managing Director / Chief Executive Officer",
      }),
    ).toBe(true);
    expect(canMergeAttendanceMappings(["branch_gm"], false)).toBe(true);
    expect(canMergeAttendanceMappings(["hr"], false)).toBe(true);
    expect(canMergeAttendanceMappings(["coo"], false)).toBe(true);
    expect(canMergeAttendanceMappings(["cashier_host"], true)).toBe(false);
    expect(canMergeAttendanceMappings(["cashier_host"], true, { jobTitle: "Team Leader" })).toBe(false);
    expect(canMergeAttendanceMappings(["duty_manager"], false)).toBe(false);
    expect(canMergeAttendanceMappings(["auditor"], false)).toBe(false);
    expect(canMergeAttendanceMappings(["cashier_host"], false, { jobTitle: "F&B Supervisor" })).toBe(true);
    expect(canMergeAttendanceMappings(["cashier_host"], false, { staffRole: "venue_supervisor" })).toBe(true);
    expect(canMergeAttendanceMappings(["hr"], false, { jobTitle: "Sr. Site Supervisor" })).toBe(true);
  });

  it("limits merge targets and unmapped ids to the team", () => {
    const team = ["host-a", "runner"];
    const sites = ["inflata"];
    expect(attendanceMappingStaffAllowed(false, team, "host-a")).toBe(true);
    expect(attendanceMappingStaffAllowed(false, team, "other")).toBe(false);
    expect(attendanceMappingStaffAllowed(true, team, "other")).toBe(true);

    expect(attendanceMappingRowAllowed(false, team, sites, { staffId: null, locationId: "inflata" })).toBe(true);
    expect(attendanceMappingRowAllowed(false, team, sites, { staffId: "runner", locationId: "other-site" })).toBe(true);
    expect(attendanceMappingRowAllowed(false, team, sites, { staffId: null, locationId: null })).toBe(true);
    expect(attendanceMappingRowAllowed(false, team, sites, { staffId: null, locationId: "other-site" })).toBe(false);
    expect(attendanceMappingRowAllowed(false, team, sites, { staffId: "other", locationId: "other-site" })).toBe(false);
    expect(attendanceMappingRowAllowed(true, team, sites, { staffId: null, locationId: "other-site" })).toBe(true);
  });
});
