import { describe, expect, it } from "vitest";

import {
  canCorrectTeamAttendance,
  canEditAttendanceMapping,
  canManageMonthlyRoster,
  canOpenShiftRoster,
  isTeamLeaderTitle,
} from "@/lib/site-ops-access";

describe("monthly roster, mapping, and team corrections", () => {
  it("allows venue supervisor, Sr. Site Supervisor, and F&B supervisor", () => {
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
      expect(canCorrectTeamAttendance(identity), JSON.stringify(identity)).toBe(true);
    }
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
});
