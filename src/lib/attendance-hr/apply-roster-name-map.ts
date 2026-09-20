import { normalizeName } from "@/lib/staff-roster/values";

import { markDuplicateStaffDateRows, type MatchedRosterRow } from "./roster-upload";

export type RosterNameMapApplyInput = {
  /** Sheet / device name used for matching and persistence. */
  sourceName: string;
  locationId: string | null;
  locationCode: string | null;
  staffId: string;
  /** Directory display name after map. */
  mappedLabel: string;
  employeeCode?: string | null;
  qid?: string | null;
};

function sameLocation(
  row: MatchedRosterRow,
  locationId: string | null,
  locationCode: string | null,
): boolean {
  if (locationId && row.locationId) return row.locationId === locationId;
  if (locationCode && row.locationCode) {
    return row.locationCode.toUpperCase() === locationCode.toUpperCase();
  }
  return Boolean(locationId || locationCode) && Boolean(row.locationId || row.locationCode);
}

function rowSourceName(row: MatchedRosterRow): string {
  return row.sourceName?.trim() || row.staffLabel;
}

/** Apply a staff pick to all preview rows with the same sheet name + location, then re-dedupe. */
export function applyStaffMapToPreviewRows(
  rows: MatchedRosterRow[],
  input: RosterNameMapApplyInput,
): MatchedRosterRow[] {
  const sourceKey = normalizeName(input.sourceName);
  if (!sourceKey || !input.staffId) return rows;

  const next = rows.map((row) => {
    if (row.matchRule === "outside_period") return row;
    if (normalizeName(rowSourceName(row)) !== sourceKey) return row;
    if (!sameLocation(row, input.locationId, input.locationCode)) return row;

    return {
      ...row,
      sourceName: rowSourceName(row),
      staffId: input.staffId,
      staffLabel: input.mappedLabel || row.staffLabel,
      employeeCode: input.employeeCode ?? row.employeeCode,
      qid: input.qid ?? row.qid,
      matchRule: "name_map",
      status: "matched" as const,
      message: null,
    };
  });

  return markDuplicateStaffDateRows(next);
}
