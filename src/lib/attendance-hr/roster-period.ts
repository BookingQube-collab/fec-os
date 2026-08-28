import { canUserDo, type AppRole } from "@/lib/rbac";
import { assignAttendanceDate } from "./calculate";
import { DEFAULT_SHIFT } from "./constants";

export type AttendanceRosterPeriodMode = "week" | "month";

export function canUploadAttendanceRoster(roles: AppRole[]): boolean {
  return canUserDo(roles, "people.edit_roster") || canUserDo(roles, "daily_ops.roster.upload");
}

export const ATTENDANCE_ROSTER_ACCEPT = ".xlsx,.xls,.csv,.html,.htm";

export const ATTENDANCE_ROSTER_TEMPLATE_HEADERS = [
  "date",
  "staff_name",
  "qid",
  "employee_code",
  "location",
  "location_name",
  "shift_start",
  "shift_end",
  "duty",
] as const;

/** FEC staff monthly cycle: 28th of previous month through 27th of selected month (YYYY-MM). */
export function monthBounds(month: string): { dateFrom: string; dateTo: string } {
  const ym = month.slice(0, 7);
  const [year, mo] = ym.split("-").map(Number);
  if (!year || !mo) return { dateFrom: `${ym}-01`, dateTo: `${ym}-01` };
  const from = new Date(Date.UTC(year, mo - 2, 28));
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: `${ym}-27` };
}

/** FEC month that contains `ymd`: the 28th onward belongs to the next calendar month. */
export function payrollMonthOf(ymd: string): string {
  const day = ymd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day.slice(0, 7);
  if (Number(day.slice(8, 10)) < 28) return day.slice(0, 7);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function payrollMonthMatchingBounds(dateFrom: string, dateTo: string): string | null {
  const from = dateFrom.slice(0, 10);
  const to = dateTo.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const month = payrollMonthOf(to);
  const bounds = monthBounds(month);
  return bounds.dateFrom === from && bounds.dateTo === to ? month : null;
}

export function defaultPayrollPeriod(todayYmd: string): { month: string; dateFrom: string; dateTo: string } {
  const month = payrollMonthOf(todayYmd);
  return { month, ...monthBounds(month) };
}

/** Visible date, e.g. "28 Jul". */
export function formatPayrollDate(ymd: string, locale = "en"): string {
  const intlLocale = locale.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  const iso = ymd.slice(0, 10);
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** Visible cycle text, e.g. "28 Jul – 27 Aug". */
export function formatPayrollRange(dateFrom: string, dateTo: string, locale = "en"): string {
  return `${formatPayrollDate(dateFrom, locale)} – ${formatPayrollDate(dateTo, locale)}`;
}

export function enumerateYmd(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return days;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export function qatarWeekBounds(ymd: string): { dateFrom: string; dateTo: string } {
  const day = ymd.slice(0, 10);
  const d = new Date(`${day}T12:00:00+03:00`);
  if (Number.isNaN(d.getTime())) return { dateFrom: day, dateTo: day };
  const weekday = d.getUTCDay();
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - weekday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
}

export function attendanceRosterPeriod(input: {
  mode: AttendanceRosterPeriodMode;
  weekStart?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  month?: string | null;
}): { dateFrom: string; dateTo: string } {
  if (input.mode === "month") {
    const month = (input.month ?? input.weekStart ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");
    return monthBounds(month);
  }
  if (input.dateFrom && input.dateTo) {
    if (input.dateFrom > input.dateTo) throw new Error("Week start must be before week end.");
    return { dateFrom: input.dateFrom.slice(0, 10), dateTo: input.dateTo.slice(0, 10) };
  }
  const start = (input.weekStart ?? input.dateFrom ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("Choose a week start date.");
  return qatarWeekBounds(start);
}

export function punchWorkDateInPeriod(punchAt: string, dateFrom: string, dateTo: string): boolean {
  const day = assignAttendanceDate(punchAt, DEFAULT_SHIFT);
  return Boolean(day) && day >= dateFrom && day <= dateTo;
}

export function filterPunchesForImportPeriod<T extends { punchAt: string }>(
  punches: T[],
  period: { dateFrom: string; dateTo: string } | null | undefined,
): { kept: T[]; skipped: number } {
  if (!period) return { kept: punches, skipped: 0 };
  const kept = punches.filter((p) => punchWorkDateInPeriod(p.punchAt, period.dateFrom, period.dateTo));
  return { kept, skipped: punches.length - kept.length };
}

/** Header-only fallback. Live download uses `/api/people/attendance-hr/roster?download=sample`. */
export function buildAttendanceRosterTemplateCsv(): string {
  return `${ATTENDANCE_ROSTER_TEMPLATE_HEADERS.join(",")}\n`;
}
