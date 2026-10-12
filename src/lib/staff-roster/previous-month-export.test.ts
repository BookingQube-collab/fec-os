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
  downloadRow({ staffName: "Ops", locationId: "ua", departmentNames: ["Operations"] }),
  downloadRow({ staffName: "Maint", locationId: "ua", departmentNames: ["Maintenance"], departmentCodes: ["MAINT"] }),
  downloadRow({ staffName: "Cafe", locationId: "ua", departmentNames: ["F&B Cafe"] }),
  downloadRow({ staffName: "Fb", locationId: "ua", department: "F&B", departmentCodes: ["FB"] }),
  downloadRow({ staffName: "Both sides", locationId: "ua", department: "F&B Cafe + Operations" }),
  downloadRow({ staffName: "Sr. Site Supervisor", locationId: "ua", departmentNames: ["Sr. Site Supervisor"] }),
  downloadRow({ staffName: "Supervisor", locationId: "ua", departmentNames: ["Supervisor"] }),
  downloadRow({ staffName: "Senior Site Supervisor", locationId: "ua", departmentNames: ["Senior Site Supervisor"] }),
  downloadRow({ staffName: "Site Supervisor", locationId: "ua", departmentCodes: ["SITE_SUP"] }),
  downloadRow({ staffName: "Manager", locationId: "ua", departmentNames: ["F&B Manager"] }),
  downloadRow({ staffName: "F&B Supervisor", locationId: "ua", departmentNames: ["F&B Supervisor"] }),
  downloadRow({ staffName: "Chef", locationId: "ua", departmentNames: ["Chef"] }),
  downloadRow({ staffName: "General Manager", locationId: "ua", departmentNames: ["General Manager"] }),
  downloadRow({ staffName: "Other site", locationId: "ho", departmentNames: ["Operations"] }),
  downloadRow({ staffName: "Blank", locationId: "ua", department: null, departmentNames: [] }),
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
    ]);
    expect(filterPreviousMonthRosterDownloadRows(downloadRows, { locationId: "  ", department: "both" })).toEqual([]);
  });
});
