export const USER_DAT_RECORD_SIZE = 72;
export const DEFAULT_DUPLICATE_WINDOW_SECONDS = 60;
export const DEFAULT_TIMEZONE = "Asia/Qatar";
/** BioPro TransInterval=1, so a 2-minute freshness window is enough for live Online. */
export const ADMS_ONLINE_WINDOW_MS = 120_000;

/** True when the terminal actually contacted ADMS (cdata or getrequest) recently. */
export function isAdmsDeviceOnline(
  lastAdmsAt: string | Date | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  if (lastAdmsAt == null || lastAdmsAt === "") return false;
  const t = lastAdmsAt instanceof Date ? lastAdmsAt.getTime() : new Date(lastAdmsAt).getTime();
  if (!Number.isFinite(t)) return false;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs - t <= ADMS_ONLINE_WINDOW_MS;
}
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;
export const ATTENDANCE_FILE_BUCKET = "attendance-imports";

export const BIOMETRIC_TEMPLATE_WARNING =
  "Biometric template files are unnecessary and sensitive. Do not upload fingerprint or face templates (including template.fp10). Only user lists and punch logs are accepted.";

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "weekly_off",
  "public_holiday",
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "late",
  "early_departure",
  "missed_punch",
  "incomplete",
  "overtime",
  "review_required",
  "unscheduled",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const CORRECTION_KINDS = [
  "add_punch",
  "edit_in",
  "edit_out",
  "mark_leave",
  "mark_holiday",
  "mark_week_off",
  "approve_overtime",
  "ignore_duplicate",
  "map_user",
] as const;

export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

export const IMPORT_FILE_TYPES = [
  "user_dat",
  "attlog",
  "xlsx",
  "xls",
  "csv",
  "tsv",
] as const;

export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];

export const FEC_ATTENDANCE_SITES = [
  { code: "INF-CC", name: "InflataPark", venue: "City Center" },
  { code: "KDS-CC", name: "Kids Driving School", venue: "City Center" },
  { code: "UA-DM", name: "Urban Arena", venue: "Doha Mall" },
  { code: "KDS-DM", name: "Kids Mini Driving School", venue: "Doha Mall" },
  { code: "CB-VM", name: "Crayons & Bricks", venue: "Vendome Mall" },
  { code: "CB-DSM", name: "Crayons & Bricks", venue: "Dar Al Salam Mall" },
  { code: "CAR-AP", name: "Carousel", venue: "Aspire Park" },
  { code: "WM-VM", name: "Winter Mirage", venue: "Vendome Mall" },
] as const;

export type AttendanceFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  companyId?: string | null;
  locationId?: string | null;
  deviceId?: string | null;
  department?: string | null;
  staffId?: string | null;
  shiftId?: string | null;
  status?: string | null;
  exceptionType?: string | null;
  approvalStatus?: string | null;
};

export type ParsedBiometricUser = {
  biometricUserId: string;
  name: string;
  recordOffset: number;
};

export type ParsedPunch = {
  biometricUserId: string;
  punchAt: string;
  verifyMethod: number | null;
  inOutStatus: number | null;
  workCode: number | null;
  reservedField: string | null;
  raw: string;
  rowNumber: number;
};

export type ParseIssue = {
  rowNumber: number;
  code: string;
  message: string;
  raw?: string;
};

export type ShiftTemplateInput = {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  overnight: boolean;
  graceMinutes: number;
  breakMinutes: number;
  minWorkMinutes: number;
  overtimeAfterMinutes: number;
  earlyInWindowMinutes: number;
  lateOutWindowMinutes: number;
  dayCutoffTime: string;
};

export type AttendanceRuleInput = {
  duplicateWindowSeconds: number;
  autoMapEmployeeCode: boolean;
  absentRequiresRoster: boolean;
  oddPunchesNeedReview: boolean;
  extraPunchesNeedReview: boolean;
  timezone: string;
};

export const DEFAULT_RULES: AttendanceRuleInput = {
  duplicateWindowSeconds: DEFAULT_DUPLICATE_WINDOW_SECONDS,
  autoMapEmployeeCode: false,
  absentRequiresRoster: true,
  oddPunchesNeedReview: true,
  extraPunchesNeedReview: false,
  timezone: DEFAULT_TIMEZONE,
};

export const DEFAULT_SHIFT: ShiftTemplateInput = {
  name: "Standard",
  startTime: "08:00",
  endTime: "17:00",
  overnight: false,
  graceMinutes: 10,
  breakMinutes: 60,
  minWorkMinutes: 480,
  overtimeAfterMinutes: 480,
  earlyInWindowMinutes: 120,
  lateOutWindowMinutes: 180,
  dayCutoffTime: "06:00",
};

export type DailyCalcResult = {
  workDate: string;
  actualIn: string | null;
  actualOut: string | null;
  punchCount: number;
  validPunchCount: number;
  rawPunchTimes: string[];
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  missedPunch: boolean;
  status: AttendanceStatus;
  statusFlags: AttendanceStatus[];
  exceptionReason: string | null;
};
