import type { AttendanceRosterPreview } from "@/lib/attendance-hr/roster-upload";
import type { RosterPreview } from "@/lib/staff-roster/types";

export type RosterImportPreviewKind = "shift_roster" | "directory";

export type RosterImportPreviewPayload = {
  mode: "preview" | "commit";
  kind: RosterImportPreviewKind;
  batchId: string;
  periodMode?: string;
  dateFrom?: string;
  dateTo?: string;
  matched?: number;
  unmatched?: number;
  skipped?: number;
  warnings?: string[];
  errors?: Array<{ rowNumber: number; code: string; message: string } | string>;
  rows?: AttendanceRosterPreview["rows"];
  preview?: RosterPreview;
  counts?: RosterPreview["counts"];
  mapping?: Record<string, string>;
  headers?: string[];
  worksheetName?: string | null;
  needsMapping?: boolean;
};

type BatchLike = {
  id: string;
  status: string;
  summary: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isShiftPreview(value: unknown): value is AttendanceRosterPreview {
  const rec = asRecord(value);
  return Boolean(rec && Array.isArray(rec.rows) && ("matched" in rec || "unmatched" in rec));
}

function isDirectoryPreview(value: unknown): value is RosterPreview {
  const rec = asRecord(value);
  return Boolean(rec && Array.isArray(rec.rows) && rec.counts && typeof rec.counts === "object");
}

export function rosterImportPreviewFromBatch(batch: BatchLike): RosterImportPreviewPayload | null {
  const summary = asRecord(batch.summary);
  if (!summary) return null;
  const stored = summary.preview;
  const mode = batch.status === "applied" ? "commit" : "preview";
  const periodMode = typeof summary.periodMode === "string" ? summary.periodMode : undefined;
  const dateFrom = typeof summary.dateFrom === "string" ? summary.dateFrom : undefined;
  const dateTo = typeof summary.dateTo === "string" ? summary.dateTo : undefined;

  if (summary.kind === "shift_roster" || isShiftPreview(stored)) {
    if (!isShiftPreview(stored)) return null;
    return {
      ...stored,
      mode,
      kind: "shift_roster",
      batchId: batch.id,
      periodMode: periodMode ?? stored.periodMode,
      dateFrom: dateFrom ?? stored.dateFrom,
      dateTo: dateTo ?? stored.dateTo,
    };
  }

  if (!isDirectoryPreview(stored)) return null;
  return {
    mode,
    kind: "directory",
    batchId: batch.id,
    preview: stored,
    counts: stored.counts,
    mapping: asRecord(summary.mapping) as Record<string, string> | undefined,
    worksheetName: typeof summary.worksheetName === "string" ? summary.worksheetName : stored.worksheetName,
    periodMode,
    dateFrom,
    dateTo,
  };
}

export function mergeShiftPreviewRows(
  base: AttendanceRosterPreview,
  rows: AttendanceRosterPreview["rows"] | undefined,
): AttendanceRosterPreview {
  if (!rows?.length) return base;
  const byKey = new Map(rows.map((row) => [`${row.rowNumber}:${row.workDate}`, row]));
  const nextRows = base.rows.map((row) => {
    const edit = byKey.get(`${row.rowNumber}:${row.workDate}`);
    if (!edit) return row;
    return {
      ...row,
      shiftStart: edit.shiftStart,
      shiftEnd: edit.shiftEnd,
      isWeekOff: Boolean(edit.isWeekOff),
    };
  });
  return {
    ...base,
    rows: nextRows,
    matched: nextRows.filter((row) => row.status === "matched").length,
    unmatched: nextRows.filter((row) => row.status === "unmatched").length,
    skipped: nextRows.filter((row) => row.status === "skipped").length,
  };
}
