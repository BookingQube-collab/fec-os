import { detectImportFileType, isBiometricTemplateFile, normalizeFilename } from "./file-guard";
import type { ImportFileType } from "./constants";

export const ATTENDANCE_IMPORT_ACCEPT = ".dat,.xlsx,.xls,.csv";

const ALLOWED_EXT = /\.(dat|xlsx|xls|csv)$/i;

export type AttendanceImportFileKind = ImportFileType | "unknown";

export type SkippedImportFile = {
  filename: string;
  reason: "template" | "unsupported";
};

export type NamedImportFile = {
  name: string;
  size: number;
  lastModified?: number;
  webkitRelativePath?: string;
};

export type SelectedAttendanceImport<T extends NamedImportFile = NamedImportFile> = {
  accepted: T[];
  skipped: SkippedImportFile[];
};

export function classifyAttendanceImportFilename(filename: string): AttendanceImportFileKind {
  return detectImportFileType(filename);
}

export function isAllowedAttendanceImportFilename(filename: string): boolean {
  const base = normalizeFilename(filename);
  if (!base || isBiometricTemplateFile(base)) return false;
  return ALLOWED_EXT.test(base);
}

export function attendanceImportKindKey(
  kind: AttendanceImportFileKind,
): "user_dat" | "attlog" | "excel" | "csv" | "unknown" {
  if (kind === "user_dat") return "user_dat";
  if (kind === "attlog") return "attlog";
  if (kind === "xlsx" || kind === "xls") return "excel";
  if (kind === "csv") return "csv";
  return "unknown";
}

export function formatImportFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIdentity(file: NamedImportFile): string {
  const path = file.webkitRelativePath?.trim() || normalizeFilename(file.name);
  return `${path.toLowerCase()}:${file.size}:${file.lastModified ?? 0}`;
}

export function selectAttendanceImportFiles<T extends NamedImportFile>(
  incoming: Iterable<T>,
  existing: Iterable<T> = [],
): SelectedAttendanceImport<T> {
  const accepted: T[] = [...existing];
  const seen = new Set(accepted.map(fileIdentity));
  const skipped: SkippedImportFile[] = [];

  for (const file of incoming) {
    const filename = normalizeFilename(file.name);
    if (isBiometricTemplateFile(filename)) {
      skipped.push({ filename, reason: "template" });
      continue;
    }
    if (!ALLOWED_EXT.test(filename)) {
      skipped.push({ filename, reason: "unsupported" });
      continue;
    }
    const key = fileIdentity(file);
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(file);
  }

  return { accepted, skipped };
}
