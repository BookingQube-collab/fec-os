export const STAFF_ROSTER_BUCKET = "staff-roster-imports";
export const MAX_ROSTER_UPLOAD_BYTES = 15 * 1024 * 1024;

export type RosterFileType = "xlsx" | "xls" | "csv" | "html";

export type RosterFileGuard =
  | { ok: true; fileType: RosterFileType; filename: string; byteSize: number }
  | { ok: false; code: string; message: string; filename: string };

export function detectRosterUploadType(filename: string): RosterFileType | "unknown" {
  const base = filename.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  if (base.endsWith(".xlsx")) return "xlsx";
  if (base.endsWith(".xls")) return "xls";
  if (base.endsWith(".csv")) return "csv";
  if (base.endsWith(".html") || base.endsWith(".htm")) return "html";
  return "unknown";
}

export function guardRosterUpload(filename: string, byteSize: number): RosterFileGuard {
  const name = filename.replace(/\\/g, "/").split("/").pop()?.trim() || filename;
  if (!name) return { ok: false, code: "missing_filename", message: "File name is required.", filename: name };
  if (byteSize <= 0) return { ok: false, code: "empty_file", message: "The uploaded file is empty.", filename: name };
  if (byteSize > MAX_ROSTER_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "oversized",
      message: `File exceeds the ${Math.round(MAX_ROSTER_UPLOAD_BYTES / (1024 * 1024))} MB upload limit.`,
      filename: name,
    };
  }
  const fileType = detectRosterUploadType(name);
  if (fileType === "unknown") {
    return {
      ok: false,
      code: "unsupported",
      message: "Unsupported file. Upload .xlsx, .xls, .csv, or the Employee Roster HTML export.",
      filename: name,
    };
  }
  return { ok: true, fileType, filename: name, byteSize };
}
