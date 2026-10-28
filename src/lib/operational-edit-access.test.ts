import { afterEach, describe, expect, it } from "vitest";

import {
  canAmendShiftRoster,
  canBulkDeleteMonthlyRoster,
  canManageAnnouncements,
  canUserDo,
} from "@/lib/rbac";
import { setActiveCapabilityGrants, toGrantMap } from "@/lib/rbac-grants";

const SUPERVISOR_ROLES = ["duty_manager", "tech_supervisor"] as const;
const BLOCKED_ROLES = ["cashier_host", "technician", "customer_service", "auditor"] as const;

describe("supervisor and manager operational edit", () => {
  afterEach(() => {
    setActiveCapabilityGrants(null);
  });

  it("opens monthly roster edit for every login that already has people.edit_roster", () => {
    for (const role of ["coo", "regional_ops", "duty_manager", "tech_supervisor", "hr", "ceo", "branch_gm"] as const) {
      expect(canAmendShiftRoster([role]), role).toBe(true);
    }
    expect(canAmendShiftRoster([])).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"])).toBe(false);
  });

  it("shows the shift roster option for the General Manager and Adil", () => {
    expect(canAmendShiftRoster(["cashier_host"], "General Manager")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Managing Director")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Managing Director / Chief Executive Officer")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Head of Operations")).toBe(false);
  });

  it("lets site supervisors and other supervisor titles amend the monthly roster", () => {
    expect(canAmendShiftRoster(["cashier_host"], "F&B Supervisor")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Sr. Site Supervisor")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Venue Supervisor")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Site Supervisor")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Operations Supervisor")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], null, "venue_supervisor")).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "F&B Manager")).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"], "Duty Manager")).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"], "Team Leader")).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"], "Admin Team Leader")).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"], "Cashier")).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"], "Team Leader")).toBe(false);
  });

  it("lets Sr. Site Supervisor use Delete all while Venue / Site keep row amend only", () => {
    expect(canBulkDeleteMonthlyRoster(["cashier_host"], "Sr. Site Supervisor")).toBe(true);
    expect(canBulkDeleteMonthlyRoster(["cashier_host"], "Senior Site Supervisor")).toBe(true);
    expect(canBulkDeleteMonthlyRoster(["regional_ops"], "Head of Operations")).toBe(true);
    expect(canBulkDeleteMonthlyRoster(["cashier_host"], "Venue Supervisor")).toBe(false);
    expect(canBulkDeleteMonthlyRoster(["cashier_host"], "Site Supervisor")).toBe(false);
    expect(canBulkDeleteMonthlyRoster(["cashier_host"], "F&B Supervisor")).toBe(false);
    expect(canBulkDeleteMonthlyRoster(["cashier_host"], "Operations Supervisor")).toBe(false);
    expect(canBulkDeleteMonthlyRoster(["cashier_host"], null, "venue_supervisor")).toBe(false);
  });

  it("lets HoO direct-report ops peers amend the shift roster (Technician / blank title included)", () => {
    expect(canAmendShiftRoster(["cashier_host"], "Operations Manager", null, null, true)).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Operations Coordinator", null, null, true)).toBe(true);
    expect(canAmendShiftRoster(["technician"], "Technician", "technician", "Maintenance", true)).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], null, null, "Operations", true)).toBe(true);
    expect(canAmendShiftRoster(["cashier_host"], "Operations Manager", null, null, false)).toBe(false);
    expect(canAmendShiftRoster(["technician"], "Technician", "technician", "Maintenance", false)).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"], "Cashier", null, null, true)).toBe(false);
    expect(canAmendShiftRoster(["cashier_host"], "F&B Manager", null, "F&B", true)).toBe(false);
  });

  it("keeps monthly roster create, edit, delete, and import", () => {
    for (const role of SUPERVISOR_ROLES) {
      expect(canUserDo([role], "people.view_roster"), role).toBe(true);
      expect(canUserDo([role], "people.edit_roster"), role).toBe(true);
      expect(canUserDo([role], "people.import_roster"), role).toBe(true);
      expect(canUserDo([role], "daily_ops.roster.upload"), role).toBe(true);
      expect(canUserDo([role], "daily_ops.roster.generate"), role).toBe(true);
    }
    expect(canUserDo(["ceo"], "people.edit_roster")).toBe(true);
    expect(canUserDo(["regional_ops"], "people.import_roster")).toBe(true);
    expect(canUserDo(["technician"], "people.edit_roster")).toBe(false);
    expect(canUserDo(["cashier_host"], "people.import_roster")).toBe(false);
    expect(canUserDo(["hr"], "people.edit_roster")).toBe(true);
  });

  it("matches admin chat group actions without opening company-wide chat", () => {
    for (const role of SUPERVISOR_ROLES) {
      expect(canUserDo([role], "chat.view"), role).toBe(true);
      expect(canUserDo([role], "chat.send"), role).toBe(true);
      expect(canUserDo([role], "chat.create_group"), role).toBe(true);
      expect(canUserDo([role], "chat.manage_members"), role).toBe(true);
      expect(canUserDo([role], "admin.view"), role).toBe(false);
    }
    for (const role of ["ceo", "coo", "regional_ops", "branch_gm"] as const) {
      expect(canUserDo([role], "chat.manage_members"), role).toBe(true);
    }
    for (const role of BLOCKED_ROLES) {
      expect(canUserDo([role], "chat.manage_members"), role).toBe(false);
    }
    expect(canUserDo(["cfo"], "chat.create_group")).toBe(true);
    expect(canUserDo(["cfo"], "chat.manage_members")).toBe(true);
  });

  it("lets them approve attendance corrections and publish announcements", () => {
    for (const role of SUPERVISOR_ROLES) {
      expect(canUserDo([role], "attendance.approve"), role).toBe(true);
      expect(canUserDo([role], "attendance.correct"), role).toBe(true);
      expect(canManageAnnouncements([role]), role).toBe(true);
      expect(canUserDo([role], "hr.manage"), role).toBe(false);
      expect(canUserDo([role], "admin.manage_users"), role).toBe(false);
      expect(canUserDo([role], "admin.manage_roles"), role).toBe(false);
    }
    expect(canUserDo(["ceo"], "attendance.approve")).toBe(true);
    expect(canUserDo(["hr"], "attendance.approve")).toBe(true);
    expect(canManageAnnouncements(["hr"])).toBe(true);
    expect(canManageAnnouncements(["cashier_host"])).toBe(false);
    expect(canManageAnnouncements(["cfo"])).toBe(false);
    expect(canUserDo(["technician"], "attendance.approve")).toBe(false);
  });

  it("leaves bookings visibility and keeps system admin off the floor", () => {
    for (const role of ["ceo", "coo", "regional_ops", "branch_gm", ...SUPERVISOR_ROLES] as const) {
      expect(canUserDo([role], "bookings.view"), role).toBe(true);
    }
    expect(canUserDo(["duty_manager"], "bookings.create")).toBe(false);
    expect(canUserDo(["tech_supervisor"], "admin.diagnostics")).toBe(false);
    expect(canUserDo(["duty_manager"], "payroll.generate")).toBe(false);
    expect(canUserDo(["tech_supervisor"], "weekly_review.edit")).toBe(false);
  });
});
