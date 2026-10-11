import { describe, expect, it } from "vitest";

import { getEmployeeFlatRail, getVisibleDepartments, mergePeopleDirectoryDepartments } from "@/lib/nav-config";
import {
  canOpenPeopleDirectory,
  isPeopleDirectoryTeamRow,
  omitPeopleDirectorySalary,
  peopleDirectoryScope,
  peopleDirectoryShowsSalary,
} from "@/lib/people-directory-access";

describe("people directory for managers and supervisors", () => {
  it("lets an F&B Manager on cashier_host open the directory and keeps a Cashier out", () => {
    expect(canOpenPeopleDirectory(["cashier_host"], "F&B Manager")).toBe(true);
    expect(peopleDirectoryScope(["cashier_host"], "F&B Manager")).toBe("team");
    expect(canOpenPeopleDirectory(["cashier_host"], "Site Supervisor")).toBe(true);
    expect(canOpenPeopleDirectory(["cashier_host"], "Cashier")).toBe(false);
    expect(canOpenPeopleDirectory(["cashier_host"], "Host")).toBe(false);
    expect(canOpenPeopleDirectory(["cashier_host"], "Cashier / Host")).toBe(false);
    expect(canOpenPeopleDirectory(["technician"], "Technician")).toBe(false);
    expect(peopleDirectoryScope(["duty_manager"])).toBe("company");
    expect(peopleDirectoryScope(["tech_supervisor"])).toBe("company");
    expect(peopleDirectoryScope(["branch_gm"])).toBe("company");
    expect(peopleDirectoryScope(["hr"])).toBe("company");
    expect(peopleDirectoryScope(["ceo"])).toBe("company");

    expect(getEmployeeFlatRail(["cashier_host"], "F&B Manager").map((item) => item.href)).toContain("/people");
    expect(getEmployeeFlatRail(["cashier_host"], "Cashier").map((item) => item.href)).not.toContain("/people");

    const teamNav = mergePeopleDirectoryDepartments(
      getVisibleDepartments(["cashier_host"]),
      ["cashier_host"],
      "F&B Manager",
    );
    const teamHrefs = teamNav.flatMap((dept) => dept.items.map((item) => item.href));
    expect(teamHrefs).toContain("/people");
    expect(teamHrefs).not.toContain("/people/payroll");
    expect(teamHrefs).not.toContain("/people/hr/settings");
    expect(teamHrefs).not.toContain("/admin");

    const cashierNav = mergePeopleDirectoryDepartments(
      getVisibleDepartments(["cashier_host"]),
      ["cashier_host"],
      "Cashier",
    );
    expect(cashierNav.flatMap((dept) => dept.items.map((item) => item.href))).not.toContain("/people");
  });

  it("omits salary for a manager and keeps it for HR and leadership", () => {
    expect(peopleDirectoryShowsSalary(["duty_manager"])).toBe(false);
    expect(peopleDirectoryShowsSalary(["tech_supervisor"])).toBe(false);
    expect(peopleDirectoryShowsSalary(["branch_gm"])).toBe(false);
    expect(peopleDirectoryShowsSalary(["cashier_host"], "F&B Manager")).toBe(false);
    expect(peopleDirectoryShowsSalary(["hr"])).toBe(true);
    expect(peopleDirectoryShowsSalary(["ceo"])).toBe(true);
    expect(peopleDirectoryShowsSalary(["coo"])).toBe(true);
    expect(peopleDirectoryShowsSalary(["hr", "branch_gm"])).toBe(true);

    const row = omitPeopleDirectorySalary({
      full_name: "Ruben Yaralyan",
      employee_code: "FB-1",
      job_title: "F&B Manager",
      monthly_salary_qar: 9000,
      daily_rate_qar: 300,
    });
    expect(row).toEqual({
      full_name: "Ruben Yaralyan",
      employee_code: "FB-1",
      job_title: "F&B Manager",
    });
    const payload = JSON.stringify(row);
    expect(payload).not.toContain("9000");
    expect(payload).not.toContain("300");
    expect(payload).not.toContain("monthly_salary_qar");
    expect(payload).not.toContain("daily_rate_qar");

    expect(isPeopleDirectoryTeamRow({ status: "active", employmentType: "permanent" })).toBe(true);
    expect(isPeopleDirectoryTeamRow({ status: "on_leave", employmentType: "permanent" })).toBe(true);
    expect(isPeopleDirectoryTeamRow({ status: "vacation", employmentType: "permanent" })).toBe(true);
    expect(isPeopleDirectoryTeamRow({ status: "serving_notice", employmentType: "permanent" })).toBe(true);
    expect(isPeopleDirectoryTeamRow({ status: "resigned", employmentType: "permanent" })).toBe(false);
    expect(isPeopleDirectoryTeamRow({ status: "terminated", employmentType: "permanent" })).toBe(false);
    expect(isPeopleDirectoryTeamRow({ status: "active", employmentType: "joker" })).toBe(false);
    expect(isPeopleDirectoryTeamRow({ status: "joker", employmentType: "permanent" })).toBe(false);
    expect(
      isPeopleDirectoryTeamRow({ status: "active", employmentType: "permanent", deletedAt: "2026-01-01" }),
    ).toBe(false);
  });
});
