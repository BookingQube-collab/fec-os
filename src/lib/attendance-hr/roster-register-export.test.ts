import { describe, expect, it } from "vitest";

import {
  e3RosterRegisterExportFilename,
  rosterExportCellCode,
  rosterExportCellText,
  rosterExportPdfCellText,
  buildRosterRegisterExcelSheet,
} from "./roster-register-export";

describe("roster register export", () => {
  it("formats duty codes like the grid", () => {
    expect(rosterExportCellCode({ isWeekOff: true, leaveType: null, shiftStart: null, shiftEnd: null })).toBe("OFF");
    expect(
      rosterExportCellCode({ isWeekOff: false, leaveType: "annual_leave", shiftStart: null, shiftEnd: null }),
    ).toBe("AL");
    expect(
      rosterExportCellCode({ isWeekOff: false, leaveType: "sick_leave", shiftStart: null, shiftEnd: null }),
    ).toBe("SL");
    expect(
      rosterExportCellCode({ isWeekOff: false, leaveType: "comp_off", shiftStart: null, shiftEnd: null }),
    ).toBe("CO");
    expect(
      rosterExportCellCode({ isWeekOff: false, leaveType: null, shiftStart: "16:00", shiftEnd: "23:00" }),
    ).toBe("16:00\n23:00");
  });

  it("includes location code under cell text", () => {
    expect(
      rosterExportCellText([
        {
          id: "1",
          locationId: "loc",
          locationCode: "CAR-AP",
          locationName: "Carousel",
          staffId: "s1",
          staffName: "Beth",
          employeeCode: "CAR-AP-STF01",
          qid: null,
          workDate: "2026-10-12",
          shiftStart: "16:00",
          shiftEnd: "23:00",
          isWeekOff: false,
          leaveType: null,
        },
      ]),
    ).toBe("16:00\n23:00\nCAR-AP");
  });

  it("uses compact PDF cells", () => {
    expect(
      rosterExportPdfCellText([
        {
          id: "1",
          locationId: "loc",
          locationCode: "CAR-AP",
          locationName: null,
          staffId: "s1",
          staffName: "Beth",
          employeeCode: null,
          qid: null,
          workDate: "2026-10-12",
          shiftStart: "16:00",
          shiftEnd: "23:00",
          isWeekOff: false,
          leaveType: null,
        },
      ]),
    ).toBe("16:00-23:00");
  });

  it("builds E3 filenames", () => {
    expect(e3RosterRegisterExportFilename("2026-09-28", "2026-10-27", "xlsx", "CAR-AP")).toBe(
      "E3_Monthly_Roster_CAR-AP_2026-09-28_to_2026-10-27.xlsx",
    );
    expect(e3RosterRegisterExportFilename("2026-09-28", "2026-10-27", "pdf")).toBe(
      "E3_Monthly_Roster_2026-09-28_to_2026-10-27.pdf",
    );
  });

  it("builds a staff × date Excel sheet with period headers", () => {
    const built = buildRosterRegisterExcelSheet(
      [
        {
          id: "1",
          locationId: "loc",
          locationCode: "CAR-AP",
          locationName: "Carousel",
          staffId: "s1",
          staffName: "Beth Wangechi",
          employeeCode: "CAR-AP-STF11",
          qid: null,
          workDate: "2026-10-12",
          shiftStart: "16:00",
          shiftEnd: "23:00",
          isWeekOff: false,
          leaveType: null,
        },
        {
          id: "2",
          locationId: "loc",
          locationCode: "CAR-AP",
          locationName: "Carousel",
          staffId: "s1",
          staffName: "Beth Wangechi",
          employeeCode: "CAR-AP-STF11",
          qid: null,
          workDate: "2026-10-13",
          shiftStart: null,
          shiftEnd: null,
          isWeekOff: true,
          leaveType: null,
        },
      ],
      "2026-10-12",
      "2026-10-13",
      {
        filters: { locationLabel: "CAR-AP - Carousel" },
        generatedAt: new Date("2026-10-27T10:00:00.000Z"),
      },
    );
    expect(built.staffCount).toBe(1);
    expect(built.dateCount).toBe(2);
    expect(built.sheet.aoa[0]?.[0]).toMatch(/Monthly Shift Roster/);
    const header = built.sheet.aoa.find((row) => row[0] === "No.");
    expect(header?.[2]).toBe("Staff");
    const data = built.sheet.aoa.find((row) => row[2] === "Beth Wangechi");
    expect(data?.[1]).toBe("CAR-AP-STF11");
    expect(String(data?.[3])).toContain("16:00");
    expect(String(data?.[4])).toContain("OFF");
  });
});
