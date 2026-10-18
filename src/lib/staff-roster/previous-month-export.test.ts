import { describe, expect, it } from "vitest";

import { PEOPLE_ROSTER_SAMPLE_HEADERS, buildPeopleRosterSheetMatrix } from "./period-sample";
import {
  filterPreviousMonthRosterDownloadRows,
  previousMonthRosterSheetLines,
  previousMonthRosterShiftCell,
  type PreviousMonthRosterDepartment,
  type PreviousMonthRosterDownloadRow,
} from "./previous-month-export";

describe("previous month roster sheet", () => {
  it("keeps stored shift text and does not invent a duty time", () => {
    expect(
      previousMonthRosterShiftCell({
        isWeekOff: false,
        leaveType: null,
        shiftStart: "09:00:00",
        shiftEnd: "17:00",
      }),
    ).toBe("09:00-17:00");
    expect(
      previousMonthRosterShiftCell({
        isWeekOff: true,
        leaveType: null,
        shiftStart: null,
        shiftEnd: null,
      }),
    ).toBe("DAY OFF");
    expect(
      previousMonthRosterShiftCell({
        isWeekOff: false,
        leaveType: null,
        shiftStart: null,
        shiftEnd: null,
      }),
    ).toBe("");
  });

  it("writes stored rows with the sample columns, and headers only when empty", () => {
    const period = { dateFrom: "2026-08-28", dateTo: "2026-09-27" };
    const filled = buildPeopleRosterSheetMatrix(
      previousMonthRosterSheetLines([
        {
          workDate: "2026-09-01",
          staffName: "Agnes Kirorio",
          employeeCode: "UA-DM-1",
          locationCode: "UA-DM",
          locationName: "Urban Arena",
          shiftStart: "12:00",
          shiftEnd: "21:00",
          isWeekOff: false,
          leaveType: null,
        },
      ]),
      period,
      { periodMode: "month" },
    );
    expect([...filled.headers]).toEqual([...PEOPLE_ROSTER_SAMPLE_HEADERS]);
    expect(filled.title).toBe("DATE WISE MONTHLY ROSTER");
    expect(filled.periodLine).toContain("28-Aug-2026 to 27-Sep-2026");
    expect(filled.rows).toEqual([["1-Sep-2026", "Agnes Kirorio", "Urban Arena - Doha Mall", "12:00-21:00"]]);

    const empty = buildPeopleRosterSheetMatrix([], period, { periodMode: "month" });
    expect(empty.rowCount).toBe(0);
    expect([...empty.headers]).toEqual(["DATE", "EMPLOYEE", "LOCATION", "SHIFT"]);
    expect(empty.rows).toEqual([]);
  });
});

function downloadRow(
  partial: Partial<PreviousMonthRosterDownloadRow> & Pick<PreviousMonthRosterDownloadRow, "staffName" | "locationId">,
): PreviousMonthRosterDownloadRow {
  return {
    workDate: "2026-09-01",
    employeeCode: null,
    locationCode: "UA-DM",
    locationName: "Urban Arena",
    shiftStart: "12:00",
    shiftEnd: "21:00",
    isWeekOff: false,
    leaveType: null,
    department: null,
    departmentNames: [],
    departmentCodes: [],
    ...partial,
  };
}

const downloadRows: PreviousMonthRosterDownloadRow[] = [
  downloadRow({ staffName: "Ops", locationId: "ua", staffId: "s-ops", departmentNames: ["Operations"] }),
  downloadRow({ staffName: "Maint", locationId: "ua", staffId: "s-maint", departmentNames: ["Maintenance"], departmentCodes: ["MAINT"] }),
  downloadRow({ staffName: "Cafe", locationId: "ua", staffId: "s-cafe", departmentNames: ["F&B Cafe"] }),
  downloadRow({ staffName: "Fb", locationId: "ua", staffId: "s-fb", department: "F&B", departmentCodes: ["FB"] }),
  downloadRow({ staffName: "Both sides", locationId: "ua", staffId: "s-both", department: "F&B Cafe + Operations" }),
  downloadRow({ staffName: "Sr. Site Supervisor", locationId: "ua", staffId: "s-sr", departmentNames: ["Sr. Site Supervisor"] }),
  downloadRow({ staffName: "Supervisor", locationId: "ua", staffId: "s-sup", departmentNames: ["Supervisor"] }),
  downloadRow({ staffName: "Senior Site Supervisor", locationId: "ua", staffId: "s-senior", departmentNames: ["Senior Site Supervisor"] }),
  downloadRow({ staffName: "Site Supervisor", locationId: "ua", staffId: "s-site", departmentCodes: ["SITE_SUP"] }),
  downloadRow({ staffName: "Manager", locationId: "ua", staffId: "s-mgr", departmentNames: ["F&B Manager"] }),
  downloadRow({ staffName: "F&B Supervisor", locationId: "ua", staffId: "s-fb-sup", departmentNames: ["F&B Supervisor"] }),
  downloadRow({ staffName: "Chef", locationId: "ua", staffId: "s-chef", departmentNames: ["Chef"] }),
  downloadRow({ staffName: "General Manager", locationId: "ua", staffId: "s-gm", departmentNames: ["General Manager"] }),
  downloadRow({ staffName: "Other site", locationId: "ho", staffId: "s-other", departmentNames: ["Operations"] }),
  downloadRow({ staffName: "Blank", locationId: "ua", staffId: "s-blank", department: null, departmentNames: [] }),
  downloadRow({
    staffName: "Russell",
    locationId: "ua",
    staffId: "s-russell",
    locationCode: "UA-DM",
    workDate: "2026-09-02",
    departmentNames: ["Operations"],
  }),
  downloadRow({
    staffName: "Russell",
    locationId: "inf",
    staffId: "s-russell",
    locationCode: "INF-CC",
    workDate: "2026-09-01",
    departmentNames: ["Operations"],
  }),
];

function namesFor(department: PreviousMonthRosterDepartment) {
  return filterPreviousMonthRosterDownloadRows(downloadRows, { locationId: "ua", department }).map(
    (row) => row.staffName,
  );
}

describe("previous month roster location and department filter", () => {
  it("keeps one location and the operations side, including maintenance", () => {
    expect(namesFor("operations")).toEqual([
      "Ops",
      "Maint",
      "Both sides",
      "Sr. Site Supervisor",
      "Supervisor",
      "Senior Site Supervisor",
      "Site Supervisor",
      "Russell",
    ]);
  });

  it("keeps food and beverage, including F&B managers, supervisors, and their team", () => {
    expect(namesFor("fb")).toEqual(["Cafe", "Fb", "Both sides", "Manager", "F&B Supervisor", "Chef"]);
  });

  it("keeps operations, maintenance, and F&B together, and drops other departments", () => {
    expect(namesFor("both")).toEqual([
      "Ops",
      "Maint",
      "Cafe",
      "Fb",
      "Both sides",
      "Sr. Site Supervisor",
      "Supervisor",
      "Senior Site Supervisor",
      "Site Supervisor",
      "Manager",
      "F&B Supervisor",
      "Chef",
      "Russell",
    ]);
    expect(filterPreviousMonthRosterDownloadRows(downloadRows, { locationId: "  ", department: "both" })).toEqual([]);
  });

  it("keeps one person across every location and ignores department grouping", () => {
    const rows = filterPreviousMonthRosterDownloadRows(downloadRows, { staffId: "s-russell" });
    expect(rows.map((row) => `${row.workDate}:${row.locationCode}`)).toEqual([
      "2026-09-02:UA-DM",
      "2026-09-01:INF-CC",
    ]);
    expect(filterPreviousMonthRosterDownloadRows(downloadRows, { staffId: "  " })).toEqual([]);
  });
});

describe("previous month roster sheet lines for multi-site staff", () => {
  it("orders one person's shifts by date then location", () => {
    const lines = previousMonthRosterSheetLines(
      filterPreviousMonthRosterDownloadRows(downloadRows, { staffId: "s-russell" }),
    );
    expect(lines).toEqual([
      {
        date: "2026-09-01",
        employee: "Russell",
        location: "Inflatapark - City Center",
        shift: "12:00-21:00",
      },
      {
        date: "2026-09-02",
        employee: "Russell",
        location: "Urban Arena - Doha Mall",
        shift: "12:00-21:00",
      },
    ]);
  });
});
