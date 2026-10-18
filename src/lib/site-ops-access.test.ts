import { describe, expect, it } from "vitest";

import {
  canCorrectTeamAttendance,
  canEditAttendanceMapping,
  canManageMonthlyRoster,
  canOpenShiftRoster,
  canOpenShiftRosterAsHoOPeer,
  isHoOOperationsPeerTitle,
  isOperationsManagerOrLeadTitle,
  isTeamLeaderTitle,
} from "@/lib/site-ops-access";

describe("monthly roster, mapping, and team corrections", () => {
  it("allows venue supervisor, Sr. Site Supervisor, and F&B supervisor on the monthly roster", () => {
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
    ];
    for (const identity of allowed) {
      expect(canCorrectTeamAttendance(identity), JSON.stringify(identity)).toBe(true);
    }
    expect(canCorrectTeamAttendance({ jobTitle: "Barista" })).toBe(false);
    expect(canCorrectTeamAttendance({ jobTitle: "F&B Manager", department: "F&B" })).toBe(true);
  });

  it("rejects team leaders and everyone outside the three roles", () => {
    expect(isTeamLeaderTitle("Team Leader")).toBe(true);
    expect(isTeamLeaderTitle("Admin Team Leader")).toBe(true);
    const denied = [
      { jobTitle: "Team Leader" },
      { department: "Team Leader" },
      { jobTitle: "Admin Team Leader" },
      { jobTitle: "Administration Team Leader" },
      { staffRole: "shift_lead", jobTitle: "Team Leader" },
      { jobTitle: "Site Supervisor" },
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
          ("jobTitle" in identity && identity.jobTitle === "Site Supervisor") ||
          ("jobTitle" in identity && identity.jobTitle === "F&B Manager")
        ),
    );
    for (const identity of correctionDenied) {
      expect(canCorrectTeamAttendance(identity), JSON.stringify(identity)).toBe(false);
    }
  });

  it("opens the shift roster for Site Supervisor, Adil, GM, and edit-roster logins without opening mapping", () => {
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
      { jobTitle: "Site Supervisor" },
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

  it("opens shift roster and team corrections for HoO direct-report Operations managers/leads", () => {
    const peers = [
      { jobTitle: "Operations Manager", reportsToHeadOfOperations: true },
      { jobTitle: "Operations Coordinator", reportsToHeadOfOperations: true },
      { jobTitle: "Operations Lead", reportsToHeadOfOperations: true },
      { jobTitle: "Manager", department: "Operations", reportsToHeadOfOperations: true },
    ];
    for (const identity of peers) {
      expect(isHoOOperationsPeerTitle(identity.jobTitle, identity.department)).toBe(true);
      expect(canOpenShiftRosterAsHoOPeer(identity)).toBe(true);
      expect(canOpenShiftRoster(identity), JSON.stringify(identity)).toBe(true);
      expect(canCorrectTeamAttendance(identity), JSON.stringify(identity)).toBe(true);
      // Same as Site Supervisor: roster yes, mapping no.
      expect(canManageMonthlyRoster(identity), JSON.stringify(identity)).toBe(false);
      expect(canEditAttendanceMapping(identity), JSON.stringify(identity)).toBe(false);
    }
  });

  it("keeps F&B, cashiers, and crew under a supervisor out of the HoO-peer roster path", () => {
    expect(isOperationsManagerOrLeadTitle("Operations Manager")).toBe(true);
    expect(isOperationsManagerOrLeadTitle("Cashier")).toBe(false);

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
        jobTitle: "Operations Manager",
        reportsToHeadOfOperations: false,
      }),
    ).toBe(false);
    // Title alone without the HoO reporting line is not enough.
    expect(canOpenShiftRoster({ jobTitle: "Operations Manager" })).toBe(false);
    expect(canOpenShiftRoster({ jobTitle: "Operations Coordinator" })).toBe(false);
  });
});
