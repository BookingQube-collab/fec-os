import { describe, expect, it } from "vitest";

import {
  getDepartmentFlyoutLinks,
  getPrimaryRailNav,
  getVisibleDepartments,
} from "@/lib/nav-config";

const ADMIN_HREFS = [
  "/admin",
  "/admin/ai-integrations",
  "/admin/diagnostics",
  "/admin/api-explorer",
] as const;

describe("admin sidebar visibility", () => {
  it("pins Administration on the executive rail with the full admin group", () => {
    const roles = ["ceo"] as const;
    const rail = getPrimaryRailNav([...roles]);
    expect(rail.some((item) => item.departmentId === "admin")).toBe(true);

    const admin = getVisibleDepartments([...roles]).find((dept) => dept.id === "admin");
    expect(admin).toBeDefined();
    const hrefs = new Set([
      ...(admin?.items.map((item) => item.href) ?? []),
      ...(admin?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? []),
    ]);
    for (const href of ADMIN_HREFS) expect(hrefs.has(href)).toBe(true);

    const flyout = getDepartmentFlyoutLinks(admin!);
    for (const href of ADMIN_HREFS) {
      expect(flyout.some((link) => link.href === href)).toBe(true);
    }
  });

  it("keeps Administration for COO and regional ops, hides it from technicians", () => {
    expect(getPrimaryRailNav(["coo"]).some((item) => item.departmentId === "admin")).toBe(true);
    expect(getPrimaryRailNav(["regional_ops"]).some((item) => item.departmentId === "admin")).toBe(true);
    expect(getPrimaryRailNav(["technician"]).some((item) => item.departmentId === "admin")).toBe(false);
    expect(getVisibleDepartments(["technician"]).some((dept) => dept.id === "admin")).toBe(false);
  });

  it("lists HR payroll and field for executives", () => {
    const people = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "people");
    expect(people).toBeDefined();
    const hrefs = new Set([
      ...(people?.items.map((item) => item.href) ?? []),
      ...(people?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? []),
    ]);
    expect(hrefs.has("/people")).toBe(true);
    expect(hrefs.has("/people/attendance")).toBe(true);
    expect(hrefs.has("/people/attendance/reports")).toBe(true);
    expect(hrefs.has("/people/payroll")).toBe(true);
    expect(hrefs.has("/people/field")).toBe(true);
    expect(hrefs.has("/people/employee-app")).toBe(true);
    expect(hrefs.has("/people/leave")).toBe(true);
    expect([...hrefs].some((href) => href === "/people/attendance/field")).toBe(false);
  });

  it("organizes People into HR workflow groups", () => {
    const people = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "people");
    expect(people?.groups.map((g) => g.id)).toEqual([
      "hr-overview",
      "hr-staff",
      "hr-attendance",
      "hr-workforce",
      "hr-admin",
      "hr-employee",
      "hr-more",
    ]);
    expect(people?.items).toEqual([]);
    expect(people?.groups.find((g) => g.id === "hr-workforce")?.items.map((i) => i.href)).toEqual([
      "/people/payroll",
      "/people/leave",
      "/people/field",
    ]);
    expect(people?.groups.find((g) => g.id === "hr-attendance")?.items.some((i) => i.href === "/people/field")).toBe(
      false,
    );
  });

  it("keeps payroll visible for CFO via workforce group", () => {
    const people = getVisibleDepartments(["cfo"]).find((dept) => dept.id === "people");
    const hrefs = new Set(people?.groups.flatMap((g) => g.items.map((i) => i.href)) ?? []);
    expect(hrefs.has("/people/payroll")).toBe(true);
  });

  it("hides payroll from technicians", () => {
    const people = getVisibleDepartments(["technician"]).find((dept) => dept.id === "people");
    const hrefs = new Set([
      ...(people?.items.map((item) => item.href) ?? []),
      ...(people?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? []),
    ]);
    expect(hrefs.has("/people/payroll")).toBe(false);
  });

  it("keeps a group visible when some children fail capability checks", () => {
    const maintenance = getVisibleDepartments(["technician"]).find((dept) => dept.id === "maintenance");
    const group = maintenance?.groups.find((g) => g.id === "maintenance");
    expect(group).toBeDefined();
    expect(group?.items.some((item) => item.href === "/maintenance")).toBe(true);
    expect(group?.items.some((item) => item.href === "/maintenance/weekly-report/executive")).toBe(false);
  });
});
