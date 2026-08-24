import {
  BIOMETRIC_TEMPLATE_WARNING,
  MAX_UPLOAD_BYTES,
  type ImportFileType,
} from "./constants";

const TEMPLATE_NAME =
  /(?:^|[\\/])(template\.fp10(?:\.\d+)?|.*(?:fingerprint|face[_-]?template|facetpl).*)/i;

const TEMPLATE_EXT = /\.(?:fp10|fpt|zkfp|fptemp|fp11)(?:\.\d+)?$/i;

export type FileGuardResult =
  | { ok: true; fileType: ImportFileType | "unknown"; filename: string; byteSize: number }
  | { ok: false; code: string; message: string; filename: string };

export function normalizeFilename(name: string): string {
  return name.replace(/\\/g, "/").split("/").pop()?.trim() || name;
}

export function isBiometricTemplateFile(filename: string): boolean {
  const base = normalizeFilename(filename);
  return TEMPLATE_NAME.test(base) || TEMPLATE_EXT.test(base);
}

export function detectImportFileType(filename: string): ImportFileType | "unknown" {
  const base = normalizeFilename(filename).toLowerCase();
  if (base === "user.dat" || base.endsWith("/user.dat") || base.endsWith("\\user.dat")) return "user_dat";
  if (base.endsWith("user.dat")) return "user_dat";
  if (base.endsWith("_attlog.dat") || base.endsWith("attlog.dat") || base.endsWith(".dat")) {
    if (base.includes("user")) return "user_dat";
    return "attlog";
  }
  if (base.endsWith(".xlsx")) return "xlsx";
  if (base.endsWith(".xls")) return "xls";
  if (base.endsWith(".csv")) return "csv";
  if (base.endsWith(".tsv") || base.endsWith(".txt")) return "tsv";
  return "unknown";
}

export function guardAttendanceUpload(filename: string, byteSize: number): FileGuardResult {
  const name = normalizeFilename(filename);
  if (!name) {
    return { ok: false, code: "missing_filename", message: "File name is required.", filename: name };
  }
  if (isBiometricTemplateFile(name)) {
    return { ok: false, code: "biometric_template", message: BIOMETRIC_TEMPLATE_WARNING, filename: name };
  }
  if (byteSize <= 0) {
    return { ok: false, code: "empty_file", message: "The uploaded file is empty.", filename: name };
  }
  if (byteSize > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "oversized",
      message: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB upload limit.`,
      filename: name,
    };
  }
  const fileType = detectImportFileType(name);
  if (fileType === "unknown") {
    return {
      ok: false,
      code: "unsupported",
      message: "Unsupported file. Upload user.dat, *_attlog.dat, Excel (.xlsx/.xls), CSV or TSV.",
      filename: name,
    };
  }
  return { ok: true, fileType, filename: name, byteSize };
}

/** Reject leftover template blobs that slipped past the name check. */
export function looksLikeTemplatePayload(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const head = buffer.subarray(0, 64).toString("latin1");
  if (/FP10|ZKFP|FINGERPRINT TEMPLATE|FACETEMP/i.test(head)) return true;
  return false;
}
