import type { ParseIssue, ParsedPunch } from "./constants";
import { detectBufferKind } from "./detect";
import { guardAttendanceUpload } from "./file-guard";
import { fileSha256 } from "./hash";
import { parseAttlogBuffer } from "./parse-attlog";
import { parseDelimitedAttendance, parseWorkbookAttendance } from "./parse-spreadsheet";
import { parseUserDat } from "./parse-user-dat";

function sanitizePreviewErrors(errors: ParseIssue[], limit = 20): ParseIssue[] {
  return errors.slice(0, limit).map((e) => ({
    rowNumber: e.rowNumber,
    code: e.code,
    message: e.message.slice(0, 240),
    raw: e.raw ? e.raw.slice(0, 120) : undefined,
  }));
}

function punchStats(punches: ParsedPunch[]) {
  const ids = [...new Set(punches.map((p) => p.biometricUserId))];
  const times = punches.map((p) => p.punchAt).filter(Boolean).sort();
  return {
    uniqueUserIds: ids.slice(0, 2000),
    uniqueUserCount: ids.length,
    dateFrom: times[0] ?? null,
    dateTo: times[times.length - 1] ?? null,
  };
}

function emptyParseMessage(filename: string) {
  return `No punches or users could be read from ${filename}. Upload a ZKTeco attlog (.dat), user.dat, Excel or CSV — not fingerprint or face templates.`;
}

export async function previewAttendanceFile(file: {
  filename: string;
  buffer: Buffer;
  locationId: string;
  deviceId: string;
  companyId: string;
}) {
  const guard = guardAttendanceUpload(file.filename, file.buffer.length);
  if (!guard.ok) {
    return {
      ok: false as const,
      code: guard.code,
      message: guard.message,
      filename: file.filename,
      users: [],
      userCount: 0,
      punches: [],
      punchCount: 0,
      uniqueUserIds: [],
      uniqueUserCount: 0,
      dateFrom: null as string | null,
      dateTo: null as string | null,
      errors: [{ rowNumber: 0, code: guard.code, message: guard.message }],
    };
  }
  const detected = detectBufferKind(file.buffer, guard.fileType);
  if (detected.kind === "template") {
    return {
      ok: false as const,
      code: "biometric_template",
      message: detected.message,
      filename: file.filename,
      users: [],
      userCount: 0,
      punches: [],
      punchCount: 0,
      uniqueUserIds: [],
      uniqueUserCount: 0,
      dateFrom: null as string | null,
      dateTo: null as string | null,
      errors: [{ rowNumber: 0, code: "biometric_template", message: detected.message }],
    };
  }
  if (detected.kind === "user_dat" || guard.fileType === "user_dat") {
    const parsed = parseUserDat(file.buffer);
    const ids = parsed.users.map((u) => u.biometricUserId);
    return {
      ok: parsed.users.length > 0,
      kind: "user_dat" as const,
      filename: file.filename,
      fileHash: fileSha256(file.buffer),
      users: parsed.users.slice(0, 200),
      userCount: parsed.users.length,
      punches: [],
      punchCount: 0,
      uniqueUserIds: ids.slice(0, 2000),
      uniqueUserCount: ids.length,
      dateFrom: null as string | null,
      dateTo: null as string | null,
      errors: sanitizePreviewErrors(parsed.errors),
      message: parsed.users.length > 0 ? undefined : parsed.errors[0]?.message ?? emptyParseMessage(file.filename),
    };
  }
  if (guard.fileType === "xlsx" || guard.fileType === "xls" || detected.kind === "spreadsheet") {
    const parsed =
      guard.fileType === "csv" || guard.fileType === "tsv"
        ? parseDelimitedAttendance(file.buffer.toString("utf8"), guard.fileType === "tsv" ? "\t" : ",")
        : await parseWorkbookAttendance(file.buffer);
    const stats = punchStats(parsed.punches);
    const ok = parsed.punches.length > 0 || parsed.users.length > 0;
    return {
      ok,
      kind: parsed.kind,
      filename: file.filename,
      fileHash: fileSha256(file.buffer),
      users: parsed.users.slice(0, 200),
      userCount: parsed.users.length,
      punches: parsed.punches.slice(0, 200),
      punchCount: parsed.punches.length,
      uniqueUserIds: stats.uniqueUserIds,
      uniqueUserCount: stats.uniqueUserCount || parsed.users.length,
      dateFrom: stats.dateFrom,
      dateTo: stats.dateTo,
      errors: sanitizePreviewErrors(parsed.errors),
      mapping: parsed.mapping,
      message: ok ? undefined : parsed.errors[0]?.message ?? emptyParseMessage(file.filename),
    };
  }
  const parsed = parseAttlogBuffer(file.buffer);
  const stats = punchStats(parsed.punches);
  const ok = parsed.punches.length > 0;
  return {
    ok,
    kind: "attlog" as const,
    filename: file.filename,
    fileHash: fileSha256(file.buffer),
    users: [],
    userCount: stats.uniqueUserCount,
    punches: parsed.punches.slice(0, 200),
    punchCount: parsed.punches.length,
    uniqueUserIds: stats.uniqueUserIds,
    uniqueUserCount: stats.uniqueUserCount,
    dateFrom: stats.dateFrom,
    dateTo: stats.dateTo,
    errors: sanitizePreviewErrors(parsed.errors),
    message: ok ? undefined : parsed.errors[0]?.message ?? emptyParseMessage(file.filename),
  };
}
