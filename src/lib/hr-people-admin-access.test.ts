import { describe, expect, it } from "vitest";

import { canActorPerform } from "@/lib/arcade/access";
import { hierarchyAccessMode } from "@/lib/hierarchy-access";
import {
  getVisibleDepartments,
  type NavAccessActor,
} from "@/lib/nav-config";
import { canUserDo } from "@/lib/rbac";

import {
  hasMiaHrPeopleAdminAccess,
  isMiaHrIdentity,
  MIA_HR_EMAIL,
  MIA_HR_EMPLOYEE_CODE,
  MIA_HR_FULL_NAME,
  MIA_HR_STAFF_ID,
  MIA_PEOPLE_ADMIN_EXTRA_CAPABILITIES,
} from "./hr-people-admin-access";

const miaActor: NavAccessActor = {
  staffId: MIA_HR_STAFF_ID,
  employeeCode: MIA_HR_EMPLOYEE_CODE,
  email: MIA_HR_EMAIL,
  displayName: MIA_HR_FULL_NAME,
  jobTitle: "HR Generalist",
  department: "HR, Management",
};

function peopleHrefs(roles: string[], actor?: NavAccessActor): string[] {
  const people = getVisibleDepartments(roles as never, actor).find((dept) => dept.id === "people");
  return people?.items.map((item) => item.href) ?? [];
}

describe("isMiaHrIdentity", () => {
  it("matches stable staff id, employee code, email, and full name", () => {
    expect(isMiaHrIdentity({ staffId: MIA_HR_STAFF_ID })).toBe(true);
    expect(isMiaHrIdentity({ employeeCode: "88" })).toBe(true);
    expect(isMiaHrIdentity({ email: "Mia@FEC.qa" })).toBe(true);
    expect(isMiaHrIdentity({ fullName: MIA_HR_FULL_NAME })).toBe(true);
    expect(isMiaHrIdentity({ fullName: "Reycie Mia Cenizal Memije" })).toBe(true);
  });

  it("does not match other people named Mia without HR context", () => {
    expect(
      isMiaHrIdentity({
        fullName: "Uzzal Mia Alkas mia",
        jobTitle: "Cleaner",
        department: "Operations",
      }),
    ).toBe(false);
    expect(isMiaHrIdentity({ fullName: "Mia Maintenance", jobTitle: "Technician" })).toBe(false);
  });

  it("matches a short Mia name only with an HR title", () => {
    expect(isMiaHrIdentity({ displayName: "Mia", jobTitle: "HR Generalist" })).toBe(true);
    expect(isMiaHrIdentity({ displayName: "Mia", jobTitle: "Cashier" })).toBe(false);
  });
});

describe("hasMiaHrPeopleAdminAccess", () => {
  it("requires the hr role plus Mia identity", () => {
    expect(hasMiaHrPeopleAdminAccess(["hr"], miaActor)).toBe(true);
    expect(hasMiaHrPeopleAdminAccess(["hr", "cashier_host"], { employeeCode: "88" })).toBe(true);
    expect(hasMiaHrPeopleAdminAccess(["cashier_host"], miaActor)).toBe(false);
    expect(hasMiaHrPeopleAdminAccess(["hr"], { employeeCode: "PERSONA-HR", jobTitle: "HR Manager" })).toBe(
      false,
    );
  });
});

describe("Mia People & HR nav vs other HR", () => {
  it("gives Mia the same People modules as CEO for org chart and extras", () => {
    const ceo = new Set(peopleHrefs(["ceo"]));
    const mia = new Set(peopleHrefs(["hr"], miaActor));
    const otherHr = new Set(peopleHrefs(["hr"], { jobTitle: "HR Manager", employeeCode: "PERSONA-HR" }));

    expect(mia.has("/people")).toBe(true);
    expect(mia.has("/people/roster")).toBe(true);
    expect(mia.has("/people/attendance")).toBe(true);
    expect(mia.has("/people/attendance/corrections")).toBe(true);
    expect(mia.has("/people/attendance/mapping")).toBe(true);
    expect(mia.has("/people/payroll")).toBe(true);
    expect(mia.has("/people/leave")).toBe(true);
    expect(mia.has("/people/hr/documents")).toBe(true);
    expect(mia.has("/people/training")).toBe(true);
    expect(mia.has("/people/hr/hierarchy")).toBe(true);
    expect(ceo.has("/people/hr/hierarchy")).toBe(true);

    expect(otherHr.has("/people")).toBe(true);
    expect(otherHr.has("/people/hr/hierarchy")).toBe(false);

    for (const capability of MIA_PEOPLE_ADMIN_EXTRA_CAPABILITIES) {
      expect(canActorPerform(["hr"], capability, miaActor)).toBe(true);
      expect(canActorPerform(["hr"], capability, { jobTitle: "HR Manager" })).toBe(false);
      expect(canUserDo(["hr"], capability)).toBe(false);
    }
    expect(canActorPerform(["hr"], "admin.view", miaActor)).toBe(false);
    expect(canActorPerform(["hr"], "admin.manage_roles", miaActor)).toBe(false);
    expect(canActorPerform(["hr"], "arcade.view", miaActor)).toBe(false);
  });

  it("keeps Administration closed for Mia while opening People org chart", () => {
    const deptIds = getVisibleDepartments(["hr"], miaActor).map((dept) => dept.id);
    expect(deptIds).toContain("people");
    expect(deptIds).not.toContain("admin");
  });

  it("treats Mia as a company org-chart editor", () => {
    expect(
      hierarchyAccessMode({
        maxRoleLevel: 55,
        directReportCount: 0,
        companyEditor: hasMiaHrPeopleAdminAccess(["hr"], miaActor),
      }),
    ).toBe("edit");
    expect(
      hierarchyAccessMode({
        maxRoleLevel: 55,
        directReportCount: 0,
        companyEditor: hasMiaHrPeopleAdminAccess(["hr"], { employeeCode: "PERSONA-HR" }),
      }),
    ).toBe("none");
  });
});
