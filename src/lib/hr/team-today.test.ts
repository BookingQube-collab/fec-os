import { describe, expect, it } from "vitest";

import {
  attendanceRowCountsAsPresent,
  buildTeamToday,
  classifyTeamTodayStatus,
  countTeamTodayPeople,
  filterTeamTodayByLocation,
  normalizeTeamTodayLeaveType,
  showsSupervisorTeamToday,
  summarizeTeamTodayByLocation,
  teamTodayCompanyWide,
  type TeamTodayMember,
} from "@/lib/hr/team-today";

const TODAY = "2026-10-15";

const LOCATIONS = [
  { id: "kds", label: "Kids Driving School" },
  { id: "inf", label: "Inflatapark" },
  { id: "car", label: "Carousel" },
  { id: "ua", label: "Urban Arena" },
];

function person(
  staffId: string,
  name: string,
  extra: Partial<TeamTodayMember> = {},
): TeamTodayMember {
  return {
    staffId,
    name,
    jobTitle: "Crew",
    homeLocationId: "kds",
    reportingManagerStaffId: null,
    ...extra,
  };
}

const chart: TeamTodayMember[] = [
  person("mary", "Mary Wangare", {
    jobTitle: "Sr. Site Supervisor",
    homeLocationId: "ho",
    reportingManagerStaffId: "rajan",
  }),
  person("ashfaq", "Ashfaq Noori", {
    jobTitle: "Venue Supervisor",
    homeLocationId: "kds",
    extraLocationIds: ["inf", "car", "ua"],
    reportingManagerStaffId: "mary",
  }),
  person("ma-luz", "Ma Luz", { homeLocationId: "kds", reportingManagerStaffId: "ashfaq" }),
  person("flora", "Flora", { homeLocationId: "kds", reportingManagerStaffId: "ashfaq" }),
  person("marissa", "Marissa", { homeLocationId: "inf", reportingManagerStaffId: "ashfaq" }),
  person("kds-crew", "KDS Crew", { homeLocationId: "kds", reportingManagerStaffId: "ma-luz" }),
  person("inflata-crew", "Inflata Crew", { homeLocationId: "inf", reportingManagerStaffId: "marissa" }),
  person("ruben", "Ruben", { homeLocationId: "ua", reportingManagerStaffId: "gm" }),
  person("abiola", "Abiola", {
    homeLocationId: "kds",
    reportingManagerStaffId: "ashfaq",
    assignable: false,
  }),
];

describe("team today scope", () => {
  it("keeps a supervisor on their reporting subtree and includes themselves", () => {
    const view = buildTeamToday({
      viewerStaffId: "ashfaq",
      companyWide: false,
      today: TODAY,
      people: chart,
      locations: LOCATIONS,
    });
    const ids = [...new Set(view.groups.flatMap((group) => group.people.map((row) => row.staffId)))].sort();
    expect(ids).toEqual(["ashfaq", "flora", "inflata-crew", "kds-crew", "ma-luz", "marissa"]);
    expect(ids).not.toContain("mary");
    expect(ids).not.toContain("ruben");
    expect(ids).not.toContain("abiola");
  });

  it("lets HR and admin see the whole company, including people outside one supervisor tree", () => {
    expect(teamTodayCompanyWide(["hr"])).toBe(true);
    expect(teamTodayCompanyWide(["ceo"])).toBe(true);
    expect(teamTodayCompanyWide(["coo"])).toBe(true);
    expect(teamTodayCompanyWide(["regional_ops"])).toBe(true);
    expect(teamTodayCompanyWide(["branch_gm"])).toBe(false);
    expect(teamTodayCompanyWide(["duty_manager"])).toBe(false);
    expect(teamTodayCompanyWide(["cashier_host"])).toBe(false);

    const view = buildTeamToday({
      viewerStaffId: "hr-user",
      companyWide: true,
      today: TODAY,
      people: chart,
      locations: LOCATIONS,
    });
    const ids = [...new Set(view.groups.flatMap((group) => group.people.map((row) => row.staffId)))].sort();
    expect(ids).toContain("ruben");
    expect(ids).toContain("mary");
    expect(ids).not.toContain("abiola");
  });
});

describe("team today location filter", () => {
  it("keeps one site when a location is selected and summarizes sites when it is not", () => {
    const view = buildTeamToday({
      viewerStaffId: "ashfaq",
      companyWide: false,
      today: TODAY,
      people: chart,
      punchedStaffIds: ["flora", "kds-crew"],
      locations: LOCATIONS,
    });
    const filtered = filterTeamTodayByLocation(view, "kds");
    expect(filtered.singleLocation).toBe(true);
    expect(filtered.groups).toHaveLength(1);
    expect(filtered.groups[0]?.locationId).toBe("kds");
    expect(countTeamTodayPeople(filtered.groups).present).toBe(2);

    const summaries = summarizeTeamTodayByLocation(view.groups);
    // Home sites only — ashfaq's extra sites (car/ua) do not get a row.
    expect(summaries.map((row) => row.locationId)).toEqual(["inf", "kds"]);
    expect(summaries.find((row) => row.locationId === "kds")).toMatchObject({
      present: 2,
      total: 4,
    });
  });
});

describe("team today locations", () => {
  it("shows only the one site when the team collapses to a single location", () => {
    const view = buildTeamToday({
      viewerStaffId: "ma-luz",
      companyWide: false,
      today: TODAY,
      people: chart,
      locations: LOCATIONS,
    });
    expect(view.singleLocation).toBe(true);
    expect(view.groups.map((group) => group.locationId)).toEqual(["kds"]);
    expect(view.groups[0]?.people.map((row) => row.staffId).sort()).toEqual(["kds-crew", "ma-luz"]);
  });

  it("splits a multi-site team by home site once and skips empty branches", () => {
    const view = buildTeamToday({
      viewerStaffId: "ashfaq",
      companyWide: false,
      today: TODAY,
      people: chart,
      locations: LOCATIONS,
    });
    expect(view.singleLocation).toBe(false);
    expect(view.groups.map((group) => group.locationId)).toEqual(["inf", "kds"]);
    const at = (id: string) => view.groups.find((group) => group.locationId === id)?.people.map((row) => row.staffId) ?? [];
    // Ashfaq home is kds; extraLocationIds must not clone him into car/inf/ua.
    expect(at("kds")).toEqual(["ashfaq", "flora", "kds-crew", "ma-luz"]);
    expect(at("inf")).toEqual(["inflata-crew", "marissa"]);
    expect(at("car")).toEqual([]);
    expect(at("ua")).toEqual([]);
  });

  it("keeps badge totals equal to the sum of site IN / LEAVE / OUT rows", () => {
    const view = buildTeamToday({
      viewerStaffId: "ashfaq",
      companyWide: false,
      today: TODAY,
      people: chart,
      punchedStaffIds: ["flora", "kds-crew", "marissa"],
      leaves: [
        { staffId: "ashfaq", leaveType: "annual_leave", status: "approved", dateFrom: TODAY, dateTo: TODAY },
        // Same person also in HR requests — must not double-count leave.
        { staffId: "ashfaq", leaveType: "annual", status: "approved", dateFrom: TODAY, dateTo: TODAY },
        { staffId: "inflata-crew", leaveType: "sick", status: "approved", dateFrom: TODAY, dateTo: TODAY },
      ],
      locations: LOCATIONS,
    });
    const badges = countTeamTodayPeople(view.groups);
    const sites = summarizeTeamTodayByLocation(view.groups);
    expect(sites.reduce((sum, row) => sum + row.present, 0)).toBe(badges.present);
    expect(sites.reduce((sum, row) => sum + row.annualLeave, 0)).toBe(badges.annual_leave);
    expect(sites.reduce((sum, row) => sum + row.sickLeave, 0)).toBe(badges.sick_leave);
    expect(sites.reduce((sum, row) => sum + row.notPresent, 0)).toBe(badges.not_present);
    expect(sites.reduce((sum, row) => sum + row.total, 0)).toBe(
      badges.present + badges.annual_leave + badges.sick_leave + badges.not_present,
    );
    expect(badges).toMatchObject({ present: 3, annual_leave: 1, sick_leave: 1, not_present: 1 });
    // Multi-site person (ashfaq) is annual once under home kds, never under extras.
    expect(sites.find((row) => row.locationId === "kds")).toMatchObject({
      present: 2,
      annualLeave: 1,
      notPresent: 1,
      total: 4,
    });
    expect(sites.find((row) => row.locationId === "inf")).toMatchObject({
      present: 1,
      sickLeave: 1,
      total: 2,
    });
  });
});

describe("team today status", () => {
  it("counts a stored punch or present-style day as present", () => {
    expect(attendanceRowCountsAsPresent({ punchCount: 1, status: "missed_punch" })).toBe(true);
    expect(attendanceRowCountsAsPresent({ punchCount: 0, actualIn: "2026-10-15T05:00:00Z" })).toBe(true);
    expect(attendanceRowCountsAsPresent({ punchCount: 0, status: "late" })).toBe(true);
    expect(attendanceRowCountsAsPresent({ punchCount: 0, status: "absent" })).toBe(false);
  });

  it("classifies present, annual leave, sick leave, and not present", () => {
    expect(normalizeTeamTodayLeaveType("annual_leave")).toBe("annual");
    expect(normalizeTeamTodayLeaveType("sick")).toBe("sick");
    expect(
      classifyTeamTodayStatus({ punched: true, leaves: [], today: TODAY }),
    ).toBe("present");
    expect(
      classifyTeamTodayStatus({
        punched: true,
        leaves: [{ leaveType: "annual", status: "approved", dateFrom: TODAY, dateTo: TODAY }],
        today: TODAY,
      }),
    ).toBe("annual_leave");
    expect(
      classifyTeamTodayStatus({
        punched: false,
        // Roster / attendance_leave_records spelling
        leaves: [{ leaveType: "annual_leave", status: "approved", dateFrom: TODAY, dateTo: TODAY }],
        today: TODAY,
      }),
    ).toBe("annual_leave");
    expect(
      classifyTeamTodayStatus({
        punched: false,
        leaves: [{ leaveType: "sick", status: "approved", dateFrom: "2026-10-14", dateTo: "2026-10-16" }],
        today: TODAY,
      }),
    ).toBe("sick_leave");
    expect(
      classifyTeamTodayStatus({
        punched: false,
        leaves: [{ leaveType: "annual", status: "pending", dateFrom: TODAY, dateTo: TODAY }],
        today: TODAY,
      }),
    ).toBe("not_present");
    expect(
      classifyTeamTodayStatus({
        punched: false,
        leaves: [{ leaveType: "annual", status: "approved", dateFrom: "2026-10-01", dateTo: "2026-10-02" }],
        today: TODAY,
      }),
    ).toBe("not_present");
    expect(
      classifyTeamTodayStatus({
        punched: false,
        leaves: [{ leaveType: "unpaid", status: "approved", dateFrom: TODAY, dateTo: TODAY }],
        today: TODAY,
      }),
    ).toBe("not_present");
  });

  it("puts today's status and the tracked annual balance on each row", () => {
    const view = buildTeamToday({
      viewerStaffId: "solo",
      companyWide: false,
      today: TODAY,
      people: [person("solo", "Solo", { jobTitle: "Venue Supervisor", reportingManagerStaffId: null })],
      punchedStaffIds: [],
      leaves: [{ staffId: "solo", leaveType: "annual", status: "approved", dateFrom: TODAY, dateTo: TODAY }],
      annualBalances: [{ staffId: "solo", allottedDays: 21, usedDays: 1 }],
      locations: LOCATIONS,
    });
    expect(view.groups[0]?.people[0]).toMatchObject({
      staffId: "solo",
      status: "annual_leave",
      annualRemaining: 20,
      jobTitle: "Venue Supervisor",
    });
  });
});

describe("team today audience", () => {
  it("shows the supervisor block to site supervisors and not to HR or a cashier", () => {
    expect(showsSupervisorTeamToday(["branch_gm"], "Sr. Site Supervisor")).toBe(true);
    expect(showsSupervisorTeamToday(["duty_manager"], "Supervisor")).toBe(true);
    expect(showsSupervisorTeamToday(["cashier_host"], "Venue Supervisor", "venue_supervisor")).toBe(true);
    expect(showsSupervisorTeamToday(["cashier_host"], "Cashier")).toBe(false);
    expect(showsSupervisorTeamToday(["hr"], "HR Manager")).toBe(false);
    expect(showsSupervisorTeamToday(["ceo"], "Chief Executive")).toBe(false);
  });
});
