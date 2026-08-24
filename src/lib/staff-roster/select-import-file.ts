export const ROSTER_IMPORT_ACCEPT = ".xlsx,.xls,.csv,.html,.htm";

const ALLOWED_EXT = /\.(xlsx|xls|csv|html|htm)$/i;

export function normalizeRosterFilename(filename: string): string {
  return filename.replace(/\\/g, "/").split("/").pop()?.trim() || filename;
}

export function isAllowedRosterImportFilename(filename: string): boolean {
  return ALLOWED_EXT.test(normalizeRosterFilename(filename));
}

export function formatRosterFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function rosterFileKind(filename: string): "excel" | "csv" | "html" | "unknown" {
  const base = normalizeRosterFilename(filename).toLowerCase();
  if (base.endsWith(".xlsx") || base.endsWith(".xls")) return "excel";
  if (base.endsWith(".csv")) return "csv";
  if (base.endsWith(".html") || base.endsWith(".htm")) return "html";
  return "unknown";
}

export function pickRosterImportFile(files: Iterable<File>): { file: File | null; skipped: string[] } {
  const allowed: File[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isAllowedRosterImportFilename(file.name)) allowed.push(file);
    else skipped.push(normalizeRosterFilename(file.name));
  }
  const preferred =
    allowed.find((f) => /employee\s*roster/i.test(normalizeRosterFilename(f.name))) ?? allowed[0] ?? null;
  if (preferred) {
    for (const extra of allowed) {
      if (extra !== preferred) skipped.push(normalizeRosterFilename(extra.name));
    }
  }
  return { file: preferred, skipped };
}
