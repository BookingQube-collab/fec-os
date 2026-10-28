import { describe, expect, it } from "vitest";

import {
  canBulkDeleteMonthlyRoster,
  canCorrectTeamAttendance,
  canEditAttendanceMapping,
  canManageMonthlyRoster,
  canOpenShiftRoster,
  canOpenShiftRosterAsHoOPeer,
  isHoOOperationsPeerTitle,
  isOperationsManagerOrLeadTitle,
  isTeamLeaderTitle,
  punchCorrectionSubjectsAreCompanyWide,
} from "@/lib/site-ops-access";

describe("monthly roster, mapping, and team corrections", () => {
  it("allows venue supervisor, Sr. Site Supervisor, and F&B supervisor on the monthly roster and mapping", () => {
    const allowed = [
      { staffRole: "venue_supervisor" },
      { jobTitle: "Venue Supervisor" },
      { jobTitle: "Sr. Site Supervisor" },
      { jobTitle: "Senior Site Supervisor" },
      { department: "Sr. Site Supervisor" },
      { jobTitle: "F&B Supervisor" },
      { jobTitle: "F& Supervisor" },
      { department: "F&B Supervisor" },
    ];
    for (const identity of allowed) {
      expect(canManageMonthlyRoster(identity), JSON.stringify(identity)).toBe(true);
      expect(canEditAttendanceMapping(identity), JSON.stringify(identity)).toBe(true);
    }
  });

  it("gives Delete all to Sr. Site Supervisor and privileged editors, not Venue / Site / F&B supervisors", () => {
    for (const identity of [
      { jobTitle: "Sr. Site Supervisor" },
      { jobTitle: "Senior Site Supervisor" },
      { department: "Sr. Site Supervisor" },
      { roles: ["regional_ops"] },
      { roles: ["branch_gm"] },
      { roles: ["ceo"] },
      { roles: ["hr"] },
      { jobTitle: "General Manager" },
      { jobTitle: "Operations Manager", reportsToHeadOfOperations: true },
    ]) {
      expect(canBulkDeleteMonthlyRoster(identity), JSON.stringify(identity)).toBe(true);
    }
    for (const identity of [
      { jobTitle: "Venue Supervisor" },
      { staffRole: "venue_supervisor" },
      { jobTitle: "Site Supervisor" },
      { jobTitle: "F&B Supervisor" },
      { jobTitle: "Operations Supervisor" },
      { jobTitle: "Cashier" },
      { roles: ["cashier_host"] },
      { jobTitle: "Head of Operations" },
      null,
    ]) {
      expect(canBulkDeleteMonthlyRoster(identity), JSON.stringify(identity)).toBe(false);
    }
  });

  it("lets Site Supervisor and Operations Supervisor manage the monthly roster without opening mapping", () => {
    const supervisors = [
      { jobTitle: "Site Supervisor" },
      { jobTitle: "Supervisor" },
      { jobTitle: "Operations Supervisor" },
    ];
    for (const identity of supervisors) {
      expect(canManageMonthlyRoster(identity), JSON.stringify(identity)).toBe(true);
      expect(canOpenShiftRoster(identity), JSON.stringify(identity)).toBe(true);
      expect(canEditAttendanceMapping(identity), JSON.stringify(identity)).toBe(false);
    }
  });

  it("lets Operations and F&B supervisors correct team punches", () => {
    const allowed = [
      { staffRole: "venue_supervisor" },
      { jobTitle: "Venue Supervisor" },
      { jobTitle: "Sr. Site Supervisor" },
      { jobTitle: "Site Supervisor" },
      { jobTitle: "Supervisor" },
      { jobTitle: "F&B Supervisor" },
      { jobTitle: "F& Supervisor" },
      { department: "F&B Supervisor" },
      { jobTitle: "Head of Operations" },
      { jobTitle: "Head of Operations / FEC-IT" },
    ];
    for (const identity of allowed) {
      expect(canCorrectTeamAttendance(identity), JSON.stringify(identity)).toBe(true);
    }
    expect(canCorrectTeamAttendance({ jobTitle: "Barista" })).toBe(false);
    expect(canCorrectTeamAttendance({ jobTitle: "F&B Manager", department: "F&B" })).toBe(true);
  });

  it("lists company-wide correction subjects for HoO and F&B Manager only", () => {
    expect(punchCorrectionSubjectsAreCompanyWide("Head of Operations")).toBe(true);
    expect(punchCorrectionSubjectsAreCompanyWide("Head of Operations / FEC-IT")).toBe(true);
    expect(punchCorrectionSubjectsAreCompanyWide("F&B Manager", "F&B")).toBe(true);
    expect(punchCorrectionSubjectsAreCompanyWide("Venue Supervisor")).toBe(false);
    expect(punchCorrectionSubjectsAreCompanyWide("Sr. Site Supervisor")).toBe(false);
    expect(punchCorrectionSubjectsAreCompanyWide("Cashier")).toBe(false);
  });

  it("rejects cashiers, team leaders, and non-supervisor titles for monthly roster and mapping", () => {
    expect(isTeamLeaderTitle("Team Leader")).toBe(true);
    expect(isTeamLeaderTitle("Admin Team Leader")).toBe(true);
    const denied = [
      { jobTitle: "Team Leader" },
      { department: "Team Leader" },
      { jobTitle: "Admin Team Leader" },
      { jobTitle: "Administration Team Leader" },
      { staffRole: "shift_lead", jobTitle: "Team Leader" },
      { jobTitle: "F&B Manager" },
      { jobTitle: "Duty Manager" },
      { jobTitle: "Cashier" },
      { staffRole: "crew" },
      { staffRole: "cashier" },
      { jobTitle: "Head of Operations" },
      { jobTitle: "General Manager" },
      { jobTitle: "Managing Director" },
      {},
      null,
    ];
    for (const identity of denied) {
      expect(canManageMonthlyRoster(identity), JSON.stringify(identity)).toBe(false);
      expect(canEditAttendanceMapping(identity), JSON.stringify(identity)).toBe(false);
    }
    const correctionDenied = denied.filter(
      (identity) =>
        identity &&
        !(
          "jobTitle" in identity &&
          (identity.jobTitle === "F&B Manager" || identity.jobTitle === "Head of Operations")
        ),
    );
    for (const identity of correctionDenied) {
      expect(canCorrectTeamAttendance(identity), JSON.stringify(identity)).toBe(false);
    }
  });

  it("opens the shift roster for Adil, GM, and edit-roster logins without opening monthly roster or mapping", () => {
    const allowed = [
      { roles: ["ceo"] },
      { roles: ["branch_gm"] },
      { roles: ["duty_manager"] },
      { roles: ["tech_supervisor"] },
      { roles: ["hr"] },
      { roles: ["coo"] },
      { jobTitle: "General Manager" },
      { department: "General Manager" },
      { jobTitle: "Managing Director" },
      { jobTitle: "Managing Director / Chief Executive Officer" },
    ];
    for (const identity of allowed) {
      expect(canOpenShiftRoster(identity), JSON.stringify(identity)).toBe(true);
      expect(canManageMonthlyRoster(identity), JSON.stringify(identity)).toBe(false);
      expect(canEditAttendanceMapping(identity), JSON.stringify(identity)).toBe(false);
    }
    expect(canOpenShiftRoster({ jobTitle: "Head of Operations" })).toBe(false);
    expect(canOpenShiftRoster({ roles: ["cashier_host"] })).toBe(false);
    expect(canOpenShiftRoster({ jobTitle: "Team Leader" })).toBe(false);
  });

  it("opens monthly roster, shift roster, and team corrections for HoO peers without opening mapping", () => {
    const peers = [
      { jobTitle: "Operations Manager", reportsToHeadOfOperations: true },
      { jobTitle: "Operations Coordinator", reportsToHeadOfOperations: true },
      { jobTitle: "Operations Lead", reportsToHeadOfOperations: true },
      { jobTitle: "Manager", department: "Operations", reportsToHeadOfOperations: true },
      // Russell: seeded as Technician / Maintenance under HoO — prior Manager/Lead gate blocked him.
      {
        jobTitle: "Technician",
        department: "Maintenance",
        staffRole: "technician",
        reportsToHeadOfOperations: true,
      },
      // Louie-style: Operations peer with blank / informal title under Rajan.
      { jobTitle: null, department: "Operations", reportsToHeadOfOperations: true },
      { jobTitle: "Operations", department: null, reportsToHeadOfOperations: true },
    ];
    for (const identity of peers) {
      expect(
        isHoOOperationsPeerTitle(identity.jobTitle, identity.department, identity.staffRole ?? null),
      ).toBe(true);
      expect(canOpenShiftRosterAsHoOPeer(identity)).toBe(true);
      expect(canOpenShiftRoster(identity), JSON.stringify(identity)).toBe(true);
      expect(canCorrectTeamAttendance(identity), JSON.stringify(identity)).toBe(true);
      expect(canManageMonthlyRoster(identity), JSON.stringify(identity)).toBe(true);
      expect(canEditAttendanceMapping(identity), JSON.stringify(identity)).toBe(false);
    }
  });

  it("keeps F&B, cashiers, and crew under a supervisor out of the HoO-peer roster path", () => {
    expect(isOperationsManagerOrLeadTitle("Operations Manager")).toBe(true);
    expect(isOperationsManagerOrLeadTitle("Cashier")).toBe(false);
    expect(isOperationsManagerOrLeadTitle("Technician")).toBe(false);

    expect(
      canOpenShiftRoster({
        jobTitle: "F&B Manager",
        department: "F&B",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(false);
    expect(
      canOpenShiftRoster({
        jobTitle: "Cashier",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(false);
    expect(
      canOpenShiftRoster({
        jobTitle: "Cashier / Host",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(false);
    expect(
      canOpenShiftRoster({
        jobTitle: "Team Leader",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(false);
    expect(
      canOpenShiftRoster({
        staffRole: "crew",
        jobTitle: "Attendant",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(false);
    expect(
      canCorrectTeamAttendance({
        jobTitle: "Cashier",
        reportsToHeadOfOperations: true,
      }),
    ).toBe(false);

    // Ordinary crew report to a site supervisor, not HoO — no peer flag, no access.
    expect(
      canOpenShiftRoster({
        jobTitle: "Crew / Attendant",
        department: "Operations",
        reportsToHeadOfOperations: false,
      }),
    ).toBe(false);
    expect(
      canOpenShiftRosterAsHoOPeer({
        jobTitle: "Technician",
        department: "Maintenance",
        reportsToHeadOfOperations: false,
      }),
    ).toBe(false);
    // Title alone without the HoO reporting line is not enough.
    expect(canOpenShiftRoster({ jobTitle: "Operations Manager" })).toBe(false);
    expect(canOpenShiftRoster({ jobTitle: "Operations Coordinator" })).toBe(false);
    expect(
      canOpenShiftRoster({
        jobTitle: "Technician",
        department: "Maintenance",
        staffRole: "technician",
      }),
    ).toBe(false);
  });
});
