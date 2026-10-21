import { describe, expect, it } from "vitest";

import {
  getEmployeeFlatRail,
  getPrimaryRailNav,
  getVisibleDepartments,
  mergePeopleDirectoryDepartments,
  peopleDirectoryRailItems,
} from "@/lib/nav-config";
import {
  canOpenPeopleDirectory,
  isAdminPeopleDirectoryRow,
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
    expect(canOpenPeopleDirectory(["cashier_host"], "Operations Supervisor")).toBe(true);
    expect(canOpenPeopleDirectory(["cashier_host"], "Cashier")).toBe(false);
    expect(canOpenPeopleDirectory(["cashier_host"], "Host")).toBe(false);
    expect(canOpenPeopleDirectory(["cashier_host"], "Cashier / Host")).toBe(false);
    expect(canOpenPeopleDirectory(["technician"], "Technician")).toBe(false);
    // Russell / Louie: HoO peer gets team directory + monthly roster nav.
    expect(
      canOpenPeopleDirectory(["technician"], "Technician", "technician", "Maintenance", true),
    ).toBe(true);
    expect(peopleDirectoryScope(["technician"], "Technician", "technician", "Maintenance", true)).toBe(
      "team",
    );
    expect(canOpenPeopleDirectory(["cashier_host"], "Cashier", null, null, true)).toBe(false);
    expect(peopleDirectoryScope(["duty_manager"])).toBe("company");
    expect(peopleDirectoryScope(["tech_supervisor"])).toBe("company");
    expect(peopleDirectoryScope(["branch_gm"])).toBe("company");
    expect(peopleDirectoryScope(["hr"])).toBe("company");
    expect(peopleDirectoryScope(["ceo"])).toBe("company");

    expect(getEmployeeFlatRail(["cashier_host"], "F&B Manager").map((item) => item.href)).toEqual(
      expect.arrayContaining(["/people", "/people/roster"]),
    );
    expect(getEmployeeFlatRail(["cashier_host"], "Site Supervisor").map((item) => item.href)).toContain(
      "/people/roster",
    );
    const cashierRail = getEmployeeFlatRail(["cashier_host"], "Cashier").map((item) => item.href);
    expect(cashierRail).not.toContain("/people");
    expect(cashierRail).not.toContain("/people/roster");

    const teamNav = mergePeopleDirectoryDepartments(
      getVisibleDepartments(["cashier_host"]),
      ["cashier_host"],
      "F&B Manager",
    );
    const teamHrefs = teamNav.flatMap((dept) => dept.items.map((item) => item.href));
    expect(teamHrefs).toContain("/people");
    expect(teamHrefs).toContain("/people/roster");
    expect(teamHrefs).not.toContain("/people/payroll");
    expect(teamHrefs).not.toContain("/people/hr/settings");
    expect(teamHrefs).not.toContain("/admin");

    const cashierNav = mergePeopleDirectoryDepartments(
      getVisibleDepartments(["cashier_host"]),
      ["cashier_host"],
      "Cashier",
    );
    const cashierHrefs = cashierNav.flatMap((dept) => dept.items.map((item) => item.href));
    expect(cashierHrefs).not.toContain("/people");
    expect(cashierHrefs).not.toContain("/people/roster");

    const hooPeerNav = mergePeopleDirectoryDepartments(
      getVisibleDepartments(["technician"]),
      ["technician"],
      "Technician",
      "technician",
      "Maintenance",
      true,
    );
    const hooPeerHrefs = hooPeerNav.flatMap((dept) => dept.items.map((item) => item.href));
    expect(hooPeerHrefs).toContain("/people");
    expect(hooPeerHrefs).toContain("/people/roster");

    // Collapsed rail must keep the same team pins as the expanded People section
    // (Venue / Site / Ops supervisors and HoO peers — not only the directory link).
    const venuePrimary = new Set(
      getPrimaryRailNav(["cashier_host"], {
        jobTitle: "Venue Supervisor",
        staffRole: "venue_supervisor",
      }).map((item) => item.href),
    );
    expect(
      peopleDirectoryRailItems(
        ["cashier_host"],
        "Venue Supervisor",
        venuePrimary,
        "venue_supervisor",
      ).map((item) => item.href),
    ).toEqual(["/people", "/people/roster"]);
    expect(
      peopleDirectoryRailItems(
        ["cashier_host"],
        "Site Supervisor",
        venuePrimary,
        "venue_supervisor",
      ).map((item) => item.href),
    ).toEqual(["/people", "/people/roster"]);
    expect(
      peopleDirectoryRailItems(
        ["cashier_host"],
        "Operations Supervisor",
        venuePrimary,
      ).map((item) => item.href),
    ).toEqual(["/people", "/people/roster"]);
    expect(
      peopleDirectoryRailItems(
        ["technician"],
        "Technician",
        venuePrimary,
        "technician",
        "Maintenance",
        true,
      ).map((item) => item.href),
    ).toEqual(["/people", "/people/roster"]);
    expect(
      peopleDirectoryRailItems(
        ["cashier_host"],
        "Venue Supervisor",
        new Set(["/people", "/people/roster"]),
        "venue_supervisor",
      ),
    ).toEqual([]);
    expect(peopleDirectoryRailItems(["duty_manager"], null, venuePrimary)).toEqual([]);
    expect(peopleDirectoryRailItems(["ceo"], null, venuePrimary)).toEqual([]);
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
    expect(peopleDirectoryShowsSalary(["cashier_host"], "Head of Operations")).toBe(true);
    expect(peopleDirectoryShowsSalary(["cashier_host"], "Head of Operations / FEC-IT")).toBe(true);

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
    expect(isPeopleDirectoryTeamRow({ status: "contract_finished", employmentType: "temporary" })).toBe(false);
    expect(isPeopleDirectoryTeamRow({ status: "contract_finished", employmentType: "secondment" })).toBe(false);
    expect(isPeopleDirectoryTeamRow({ status: "active", employmentType: "joker" })).toBe(true);
    expect(isPeopleDirectoryTeamRow({ status: "serving_notice", employmentType: "joker" })).toBe(true);
    expect(isPeopleDirectoryTeamRow({ status: "joker", employmentType: "permanent" })).toBe(false);
    expect(isPeopleDirectoryTeamRow({ status: "joker", employmentType: "joker" })).toBe(false);
    expect(
      isPeopleDirectoryTeamRow({ status: "active", employmentType: "permanent", deletedAt: "2026-01-01" }),
    ).toBe(false);

    expect(isAdminPeopleDirectoryRow({ status: "active", employmentType: "permanent" })).toBe(true);
    expect(isAdminPeopleDirectoryRow({ status: "probation", employmentType: "permanent" })).toBe(true);
    expect(isAdminPeopleDirectoryRow({ status: "serving_notice", employmentType: "permanent" })).toBe(true);
    expect(isAdminPeopleDirectoryRow({ status: "Serving Notice", employmentType: "permanent" })).toBe(true);
    expect(isAdminPeopleDirectoryRow({ status: "active", employmentType: "joker" })).toBe(true);
    expect(isAdminPeopleDirectoryRow({ status: "on_leave", employmentType: "permanent" })).toBe(false);
    expect(isAdminPeopleDirectoryRow({ status: "resigned", employmentType: "permanent" })).toBe(false);
    expect(isAdminPeopleDirectoryRow({ status: "terminated", employmentType: "permanent" })).toBe(false);
    expect(isAdminPeopleDirectoryRow({ status: "contract_finished", employmentType: "temporary" })).toBe(false);
    expect(isAdminPeopleDirectoryRow({ status: "serving_notice", employmentType: "joker" })).toBe(true);
    expect(isAdminPeopleDirectoryRow({ status: "joker", employmentType: "permanent" })).toBe(false);
    expect(isAdminPeopleDirectoryRow({ status: "joker", employmentType: "joker" })).toBe(false);
  });
});
