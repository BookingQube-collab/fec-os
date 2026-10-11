import { describe, expect, it } from "vitest";

import {
  canActorPerform,
  canUseArcadeTechnical,
  hasSuperAdminAccess,
  isFecTechnician,
  isFnbManager,
} from "@/lib/arcade/access";

const SITE_A = "site-a";
const SITE_B = "site-b";

describe("arcade technical access", () => {
  it("allows an FEC technician", () => {
    expect(isFecTechnician("FEC Technician", "crew")).toBe(true);
    expect(isFecTechnician("FEC Arcade Technician", null)).toBe(true);
    expect(isFecTechnician("Cashier", "technician")).toBe(true);
    expect(
      canUseArcadeTechnical({
        roles: ["cashier_host"],
        jobTitle: "FEC Technician",
        staffRole: "technician",
        locationIds: [SITE_A],
      }),
    ).toBe(true);
    expect(
      canUseArcadeTechnical(
        {
          roles: ["cashier_host"],
          jobTitle: "FEC Technician",
          staffRole: "technician",
          locationIds: [SITE_A],
        },
        SITE_A,
      ),
    ).toBe(true);
    expect(canActorPerform(["cashier_host"], "arcade.view", { jobTitle: "FEC Technician", staffRole: "technician" })).toBe(
      true,
    );
  });

  it("allows a supervisor only at their location", () => {
    const supervisor = {
      roles: ["cashier_host"] as const,
      jobTitle: "Site Supervisor",
      staffRole: "venue_supervisor",
      locationIds: [SITE_A],
    };
    expect(canUseArcadeTechnical(supervisor, SITE_A)).toBe(true);
    expect(canUseArcadeTechnical(supervisor, SITE_B)).toBe(false);
    expect(canUseArcadeTechnical({ ...supervisor, jobTitle: "F&B Supervisor", staffRole: null }, SITE_A)).toBe(true);
    expect(hasSuperAdminAccess(supervisor.roles, supervisor.jobTitle)).toBe(false);
  });

  it("allows a non-F&B manager who has the location", () => {
    expect(
      canUseArcadeTechnical(
        {
          roles: ["cashier_host"],
          jobTitle: "Duty Manager",
          department: "Operations",
          locationIds: [SITE_A],
        },
        SITE_A,
      ),
    ).toBe(true);
    expect(
      canUseArcadeTechnical(
        {
          roles: ["cashier_host"],
          jobTitle: "Operations Manager",
          locationIds: [SITE_A],
        },
        SITE_B,
      ),
    ).toBe(false);
  });

  it("denies an F&B manager even when the login role and location would otherwise allow arcade", () => {
    expect(isFnbManager("F&B Manager", null)).toBe(true);
    expect(isFnbManager("FnB Manager", "Operations")).toBe(true);
    expect(isFnbManager("Manager", "F&B")).toBe(true);
    expect(isFnbManager("Food & Beverage Manager", null)).toBe(true);
    expect(
      canUseArcadeTechnical(
        {
          roles: ["duty_manager"],
          jobTitle: "F&B Manager",
          department: "F&B",
          locationIds: [SITE_A],
        },
        SITE_A,
      ),
    ).toBe(false);
    expect(canActorPerform(["duty_manager"], "arcade.view", { jobTitle: "F&B Manager", department: "F&B" })).toBe(false);
    expect(canActorPerform(["duty_manager"], "arcade.operate", { jobTitle: "F&B Manager" })).toBe(false);
  });

  it("treats Head of Operations as super admin, including existing super-admin roles", () => {
    expect(hasSuperAdminAccess(["cashier_host"], "Head of Operations")).toBe(true);
    expect(hasSuperAdminAccess(["cashier_host"], "Head of Operations / FEC-IT")).toBe(true);
    expect(hasSuperAdminAccess(["ceo"], null)).toBe(true);
    expect(hasSuperAdminAccess(["coo"], null)).toBe(true);
    expect(hasSuperAdminAccess(["cfo"], null)).toBe(true);
    expect(hasSuperAdminAccess(["regional_ops"], null)).toBe(true);
    expect(hasSuperAdminAccess(["duty_manager"], "Site Supervisor")).toBe(false);
    expect(canActorPerform(["cashier_host"], "admin.view", { jobTitle: "Head of Operations" })).toBe(true);
    expect(canActorPerform(["cashier_host"], "admin.manage_roles", { jobTitle: "Head of Operations" })).toBe(true);
    expect(canActorPerform(["ceo"], "admin.view")).toBe(true);
    expect(
      canUseArcadeTechnical(
        { roles: ["cashier_host"], jobTitle: "Head of Operations", locationIds: [] },
        SITE_B,
      ),
    ).toBe(true);
  });
});
