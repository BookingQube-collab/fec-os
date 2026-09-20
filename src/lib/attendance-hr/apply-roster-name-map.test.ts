import { describe, expect, it } from "vitest";

import { applyStaffMapToPreviewRows } from "./apply-roster-name-map";
import type { MatchedRosterRow } from "./roster-upload";

function row(partial: Partial<MatchedRosterRow> & Pick<MatchedRosterRow, "rowNumber" | "workDate" | "staffLabel">): MatchedRosterRow {
  return {
    locationCode: "INF-CC",
    locationId: "loc-inf",
    staffId: null,
    qid: null,
    employeeCode: null,
    shiftStart: "14:00",
    shiftEnd: "23:00",
    shiftTemplateId: null,
    isWeekOff: false,
    matchRule: "name_unmatched",
    status: "unmatched",
    message: "No exact name match at this location.",
    sourceName: partial.staffLabel,
    ...partial,
  };
}

describe("applyStaffMapToPreviewRows", () => {
  it("maps all same source name + location and recounts via dedupe", () => {
    const rows = [
      row({ rowNumber: 2, workDate: "2026-08-28", staffLabel: "Jorene Tesoro Quiam" }),
      row({ rowNumber: 3, workDate: "2026-08-29", staffLabel: "Jorene Tesoro Quiam" }),
      row({ rowNumber: 4, workDate: "2026-08-28", staffLabel: "Other Person" }),
      row({
        rowNumber: 5,
        workDate: "2026-08-30",
        staffLabel: "jorene tesoro quiam",
        locationCode: "KDS",
        locationId: "loc-kds",
      }),
    ];

    const next = applyStaffMapToPreviewRows(rows, {
      sourceName: "Jorene Tesoro Quiam",
      locationId: "loc-inf",
      locationCode: "INF-CC",
      staffId: "staff-1",
      mappedLabel: "Jorene Quiam",
      employeeCode: "INF-CC-01",
    });

    expect(next.filter((r) => r.staffId === "staff-1")).toHaveLength(2);
    expect(next[0]).toMatchObject({
      status: "matched",
      matchRule: "name_map",
      staffLabel: "Jorene Quiam",
      sourceName: "Jorene Tesoro Quiam",
      message: null,
    });
    expect(next[2]?.status).toBe("unmatched");
    expect(next[3]?.status).toBe("unmatched");
  });

  it("remaps already-matched rows with the same sheet name", () => {
    const rows = [
      row({
        rowNumber: 2,
        workDate: "2026-08-28",
        staffLabel: "Directory Name",
        sourceName: "Sheet Spelling",
        staffId: "old-staff",
        status: "matched",
        matchRule: "name_map",
        message: null,
      }),
    ];
    const next = applyStaffMapToPreviewRows(rows, {
      sourceName: "Sheet Spelling",
      locationId: "loc-inf",
      locationCode: "INF-CC",
      staffId: "new-staff",
      mappedLabel: "New Person",
    });
    expect(next[0]).toMatchObject({ staffId: "new-staff", staffLabel: "New Person", status: "matched" });
  });
});
