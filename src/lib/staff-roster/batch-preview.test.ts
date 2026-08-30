import { describe, expect, it } from "vitest";

import type { AttendanceRosterPreview } from "@/lib/attendance-hr/roster-upload";
import type { RosterPreview } from "@/lib/staff-roster/types";

import { mergeShiftPreviewRows, rosterImportPreviewFromBatch } from "./batch-preview";

const shiftPreview: AttendanceRosterPreview = {
  periodMode: "week",
  dateFrom: "2026-08-23",
  dateTo: "2026-08-29",
  locationId: null,
  matched: 1,
  unmatched: 1,
  skipped: 0,
  warnings: [],
  errors: [],
  rows: [
    {
      rowNumber: 2,
      workDate: "2026-08-23",
      locationCode: "INF-CC",
      locationId: "loc-1",
      staffId: "s-1",
      staffLabel: "Amna",
      qid: "2891",
      employeeCode: "INF-01",
      shiftStart: "12:00",
      shiftEnd: "22:00",
      shiftTemplateId: null,
      isWeekOff: false,
      matchRule: "qid",
      status: "matched",
      message: null,
    },
    {
      rowNumber: 3,
      workDate: "2026-08-23",
      locationCode: "INF-CC",
      locationId: "loc-1",
      staffId: null,
      staffLabel: "Unknown",
      qid: null,
      employeeCode: null,
      shiftStart: "09:00",
      shiftEnd: "17:00",
      shiftTemplateId: null,
      isWeekOff: false,
      matchRule: "none",
      status: "unmatched",
      message: "No staff match",
    },
  ],
};

const directoryPreview: RosterPreview = {
  mode: "safe_sync",
  canHardDelete: false,
  counts: { create: 0, update: 2, unchanged: 0, archive: 1, delete: 0, review: 3, skippedEmpty: 0 },
  rows: [],
  missing: [],
  mapping: { full_name: "Employee", location: "Location" },
  worksheetName: "Employee Roster",
  errors: [],
};

describe("rosterImportPreviewFromBatch", () => {
  it("rehydrates a stored shift-roster preview", () => {
    const payload = rosterImportPreviewFromBatch({
      id: "batch-shift",
      status: "preview",
      summary: {
        kind: "shift_roster",
        preview: shiftPreview,
        periodMode: "week",
        dateFrom: "2026-08-23",
        dateTo: "2026-08-29",
      },
    });
    expect(payload?.kind).toBe("shift_roster");
    expect(payload?.batchId).toBe("batch-shift");
    expect(payload?.mode).toBe("preview");
    expect(payload?.matched).toBe(1);
    expect(payload?.rows).toHaveLength(2);
    expect(payload?.rows?.[0]?.staffLabel).toBe("Amna");
  });

  it("rehydrates a stored directory preview", () => {
    const payload = rosterImportPreviewFromBatch({
      id: "batch-dir",
      status: "preview",
      summary: {
        kind: "directory",
        preview: directoryPreview,
        mapping: directoryPreview.mapping,
        worksheetName: "Employee Roster",
      },
    });
    expect(payload?.kind).toBe("directory");
    expect(payload?.preview?.counts.review).toBe(3);
    expect(payload?.counts?.archive).toBe(1);
  });

  it("returns null when the stored preview payload is missing", () => {
    expect(
      rosterImportPreviewFromBatch({
        id: "empty",
        status: "preview",
        summary: { kind: "shift_roster" },
      }),
    ).toBeNull();
  });
});

describe("mergeShiftPreviewRows", () => {
  it("applies shift time and week-off edits without dropping matches", () => {
    const next = mergeShiftPreviewRows(shiftPreview, [
      { ...shiftPreview.rows[0], shiftStart: "13:00", shiftEnd: "21:00", isWeekOff: true },
    ]);
    expect(next.rows[0]).toMatchObject({
      staffId: "s-1",
      status: "matched",
      shiftStart: "13:00",
      shiftEnd: "21:00",
      isWeekOff: true,
    });
    expect(next.matched).toBe(1);
    expect(next.rows[1]?.staffLabel).toBe("Unknown");
  });
});
