import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ar from "@/i18n/locales/ar.json";
import en from "@/i18n/locales/en.json";
import { getVisibleDepartments } from "@/lib/nav-config";
import {
  applySidebarItemOrder,
  canReorderSidebarNav,
  defaultItemOrders,
  defaultNavDepartmentOrder,
  interpretNavItemInstruction,
  interpretNavOrderInstruction,
  moveNavDepartment,
  moveNavItem,
  navItemOrderKey,
  navOrderFromAiPayload,
  normalizeItemOrders,
  normalizeNavDepartmentOrder,
  orderDepartments,
  orderPrimaryRail,
  sidebarItemLabelCatalog,
} from "@/lib/nav-order";

describe("sidebar department order", () => {
  const known = defaultNavDepartmentOrder();

  it("keeps the catalog order when nothing is saved", () => {
    expect(normalizeNavDepartmentOrder(null)).toEqual(known);
    expect(normalizeNavDepartmentOrder([])).toEqual(known);
  });

  it("drops unknown ids and appends departments that are missing", () => {
    expect(normalizeNavDepartmentOrder(["people", "nope", "people", "training"])).toEqual([
      "people",
      "training",
      ...known.filter((id) => id !== "people" && id !== "training"),
    ]);
  });

  it("moves one department onto another without touching the rest of the sequence", () => {
    const next = moveNavDepartment(known, "training", "operations");
    expect(next[0]).toBe("training");
    expect(next[1]).toBe("operations");
    expect(next.filter((id) => id !== "training")).toEqual(known.filter((id) => id !== "training"));
  });

  it("sorts visible departments and the rail, and leaves People links alone", () => {
    const people = getVisibleDepartments(["ceo"]).find((dept) => dept.id === "people");
    const before = people?.items.map((item) => `${item.labelKey}:${item.href}`) ?? [];
    const dashboard = before.findIndex((key) => key === "nav.dashboard:/people/hr");
    expect(dashboard).toBe(0);

    const order = moveNavDepartment(known, "people", "operations");
    const departments = orderDepartments(getVisibleDepartments(["ceo"]), order);
    expect(departments[0]?.id).toBe("people");
    expect(departments.find((dept) => dept.id === "people")?.items.map((item) => `${item.labelKey}:${item.href}`)).toEqual(
      before,
    );

    const rail = orderPrimaryRail(
      [
        { departmentId: "operations" as const, href: "/" },
        { departmentId: "people" as const, href: "/people" },
        { departmentId: "admin" as const, href: "/admin" },
      ],
      order,
    );
    expect(rail.map((item) => item.departmentId)).toEqual(["people", "operations", "admin"]);
  });

  it("lets only level 95 administrators change the order", () => {
    expect(canReorderSidebarNav([{ role: "ceo", role_level: 100 }])).toBe(true);
    expect(canReorderSidebarNav([{ role: "coo", role_level: 95 }])).toBe(true);
    expect(canReorderSidebarNav([{ role: "regional_ops", role_level: 80 }])).toBe(false);
    expect(canReorderSidebarNav([{ role: "cashier_host", role_level: 10 }])).toBe(false);
    expect(canReorderSidebarNav([{ role: "hr", role_level: 60 }])).toBe(false);
  });

  it("applies a written instruction to the department list", () => {
    expect(interpretNavOrderInstruction(known, "put People & HR first")?.[0]).toBe("people");
    expect(interpretNavOrderInstruction(known, "ضع الموارد البشرية أولاً")?.[0]).toBe("people");
    expect(interpretNavOrderInstruction(known, "move training before operations")?.slice(0, 2)).toEqual([
      "training",
      "operations",
    ]);
    expect(interpretNavOrderInstruction(known, "training, people")?.slice(0, 2)).toEqual(["training", "people"]);
    const reversed = interpretNavOrderInstruction(known, "reverse");
    expect(reversed?.[0]).toBe(known[known.length - 1]);
    expect(reversed?.at(-1)).toBe(known[0]);
    const alphabetical = interpretNavOrderInstruction(known, "alphabetical");
    expect(alphabetical?.[0]).toBe("admin");
    expect(interpretNavOrderInstruction(known, "hello")).toBeNull();
  });

  it("accepts an AI order payload and ignores a payload that names nothing", () => {
    const parsed = navOrderFromAiPayload({ order: ["training", "people", "training"] });
    expect(parsed?.[0]).toBe("training");
    expect(parsed?.[1]).toBe("people");
    expect(parsed).toHaveLength(known.length);
    expect(navOrderFromAiPayload({ order: ["nope"] })).toBeNull();
    expect(navOrderFromAiPayload(null)).toBeNull();
  });

  it("wires /admin/sidebar to the saved order and the AI reorder action", () => {
    const root = path.resolve(__dirname, "../..");
    const page = readFileSync(path.join(root, "app/(protected)/admin/sidebar/page.tsx"), "utf8");
    const view = readFileSync(path.join(root, "src/views/admin-sidebar-page.tsx"), "utf8");
    expect(page).toContain('import("@/views/admin-sidebar-page")');
    expect(view).toContain("reorderSidebarNavWithInstruction");
    expect(view).toContain("canReorderSidebarNav");
    expect(view).toContain("useSidebarNavOrder");
    expect(view).toContain("moveNavDepartment");
    expect(view).toContain('id="arrange-automatically"');
    const sidebar = readFileSync(path.join(root, "src/components/layout/app-sidebar.tsx"), "utf8");
    expect(sidebar).toContain('href="/admin/sidebar#arrange-automatically"');
    expect(sidebar).toContain("sidebarOrder.arrangeAuto");
    expect(view).toContain("moveNavItem");
    expect(view).toContain("ItemDragRow");
    expect(sidebar).toContain("ItemDragRow");
  });

  it("reorders links inside a department and keeps every catalog link", () => {
    const orders = defaultItemOrders();
    const dashboard = navItemOrderKey({ labelKey: "nav.dashboard", href: "/people/hr" });
    const leave = navItemOrderKey({ labelKey: "nav.hrLeave", href: "/people/leave" });
    const people = [dashboard, ...orders.people.filter((key) => key !== dashboard)];
    const moved = moveNavItem({ ...orders, people }, "people", dashboard, leave);
    expect(moved.people.indexOf(dashboard)).toBeGreaterThan(moved.people.indexOf(leave));
    expect(moved.people).toHaveLength(orders.people.length);
    expect(normalizeItemOrders({ people: ["nope"] }).people).toEqual(orders.people);
    const removedAts = "nav.hrAts|/people/recruitment";
    const removedOnboarding = "nav.hrOnboarding|/people/hr/onboarding";
    const removedDuplicates = [
      "nav.hrDirectory|/people",
      "nav.hrAttendance|/people/attendance",
      "nav.attendanceListing|/people/attendance/reports",
      "nav.attendanceDeviceLogs|/people/attendance/device-logs",
      "nav.hrOt|/people/hr/ot",
      "nav.hrAirTickets|/people/hr/air-tickets",
      "nav.hrDocuments|/people/hr/documents",
      "nav.hrWarnings|/people/hr/warnings",
      "nav.sop|/sop",
      "nav.training|/people/training",
    ];
    expect(orders.people).not.toContain(removedAts);
    expect(orders.people).not.toContain(removedOnboarding);
    for (const key of removedDuplicates) expect(orders.people).not.toContain(key);
    const attendanceKey = navItemOrderKey({ labelKey: "nav.attendance", href: "/people/attendance" });
    const correctionsKey = navItemOrderKey({
      labelKey: "nav.attendanceCorrections",
      href: "/people/attendance/corrections",
    });
    expect(orders.people.indexOf(correctionsKey)).toBe(orders.people.indexOf(attendanceKey) + 1);
    const removedExit = [
      "nav.hrProbation|/people/hr/probation",
      "nav.hrResignations|/people/hr/resignations",
      "nav.hrTerminations|/people/hr/terminations",
    ];
    for (const key of removedExit) expect(orders.people).not.toContain(key);
    expect(orders.people).toContain(navItemOrderKey({ labelKey: "nav.hrProbationExit", href: "/people/hr/probation-exit" }));
    expect(
      normalizeItemOrders({
        people: [...removedExit, ...orders.people],
      }).people,
    ).toEqual(orders.people);
    expect(
      normalizeItemOrders({
        people: [removedAts, removedOnboarding, ...removedDuplicates, ...orders.people],
      }).people,
    ).toEqual(orders.people);
    const certificates = orders.training.find((key) => key.startsWith("nav.trainingCertificates|"));
    const practicals = orders.training.find((key) => key.startsWith("nav.trainingPracticals|"));
    expect(certificates).toBeDefined();
    expect(practicals).toBeDefined();
    const withoutCertificates = normalizeItemOrders({
      training: orders.training.filter((key) => key !== certificates),
    });
    expect(withoutCertificates.training.indexOf(certificates!)).toBe(
      withoutCertificates.training.indexOf(practicals!) + 1,
    );

    const catalog = sidebarItemLabelCatalog(
      en.nav as Record<string, unknown>,
      ar.nav as Record<string, unknown>,
    );
    const engagement = navItemOrderKey({ labelKey: "nav.hrEngagement", href: "/people/hr/engagement" });
    const instructed = interpretNavItemInstruction(
      { ...orders, people },
      "move Engagement under Leave",
      catalog,
    );
    expect(instructed?.people.indexOf(engagement)).toBe((instructed?.people.indexOf(leave) ?? -2) + 1);
    const arabic = interpretNavItemInstruction(
      { ...orders, people },
      "انقل التفاعل تحت الإجازات",
      catalog,
    );
    expect(arabic?.people.indexOf(engagement)).toBe((arabic?.people.indexOf(leave) ?? -2) + 1);
    expect(interpretNavOrderInstruction(known, "move Smart Board under Leave")).toBeNull();

    const visible = applySidebarItemOrder(getVisibleDepartments(["ceo"]), instructed ?? orders);
    const ceoPeople = visible.find((dept) => dept.id === "people");
    const keys = ceoPeople?.items.map(navItemOrderKey) ?? [];
    expect(keys.indexOf(engagement)).toBe(keys.indexOf(leave) + 1);

    const cashier = applySidebarItemOrder(getVisibleDepartments(["cashier_host"]), instructed ?? orders);
    const hrefs = new Set(cashier.find((dept) => dept.id === "people")?.items.map((item) => item.href));
    expect(hrefs.has("/people/payroll")).toBe(false);
    expect(hrefs.has("/people/attendance")).toBe(false);
    expect(hrefs.has("/people/hr")).toBe(false);
  });
});
