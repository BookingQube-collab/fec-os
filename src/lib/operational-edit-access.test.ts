import { afterEach, describe, expect, it } from "vitest";

import { canAmendShiftRoster, canManageAnnouncements, canUserDo } from "@/lib/rbac";
import { setActiveCapabilityGrants, toGrantMap } from "@/lib/rbac-grants";

const SUPERVISOR_ROLES = ["duty_manager", "tech_supervisor"] as const;
const BLOCKED_ROLES = ["cashier_host", "technician", "customer_service", "auditor"] as const;

describe("supervisor and manager operational edit", () => {
  afterEach(() => {
    setActiveCapabilityGrants(null);
  });

  it("shows monthly roster edit, delete, and Delete all even when a grant denies the capability", () => {
    const shown = ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "hr"] as const;
    const hidden = ["cashier_host", "customer_service", "technician", "auditor", "cfo"] as const;
    setActiveCapabilityGrants(
      toGrantMap(
        shown.flatMap((role) =>
          (["people.edit_roster", "people.import_roster", "daily_ops.roster.upload"] as const).map((capability) => ({
            role,
            capability,
            allowed: false,
          })),
        ),
      ),
    );
    for (const role of shown) {
      expect(canUserDo([role], "people.edit_roster"), role).toBe(false);
      expect(canAmendShiftRoster([role]), role).toBe(true);
    }
    for (const role of hidden) {
      expect(canAmendShiftRoster([role]), role).toBe(false);
    }
    expect(canAmendShiftRoster([])).toBe(false);
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
