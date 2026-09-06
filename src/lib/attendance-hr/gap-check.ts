import type { AuthContext } from "@/lib/server/auth";

import { monthBounds } from "./roster-period";

export type AttendanceGapKind =
  | "absent_rostered"
  | "all_punches_excluded"
  | "missed_punch"
  | "no_in";

export type AttendanceGapRow = {
  workDate: string;
  staffId: string | null;
  staffName: string | null;
  employeeCode: string | null;
  biometricUserId: string | null;
  kind: AttendanceGapKind;
  status: string | null;
  rawPunchCount: number;
  validPunchCount: number;
  excludedPunchCount: number;
};

export type AttendanceGapReport = {
  locationId: string;
  dateFrom: string;
  dateTo: string;
  gaps: AttendanceGapRow[];
  totals: {
    gaps: number;
    absentRostered: number;
    allExcluded: number;
    missedPunch: number;
  };
  /** True when stored punches exist but were wrongly excluded — reprocess can fix without device. */
  reprocessLikelyHelps: boolean;
  /** True when rostered days have zero raw punches — device fetch / USB may be needed. */
  deviceFetchLikelyHelps: boolean;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function resolveResyncWindow(input: {
  mode: "dates" | "fec_month";
  dates?: string[] | null;
  month?: string | null;
}): { dateFrom: string; dateTo: string; dates: string[] } {
  if (input.mode === "fec_month") {
    const month = (input.month ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");
    const bounds = monthBounds(month);
    return { ...bounds, dates: [] };
  }
  const dates = [...new Set((input.dates ?? []).map((d) => d.slice(0, 10)).filter((d) => YMD.test(d)))].sort();
  if (!dates.length) throw new Error("Choose at least one date.");
  if (dates.length > 62) throw new Error("Too many dates (max 62).");
  return { dateFrom: dates[0], dateTo: dates[dates.length - 1], dates };
}

/** Qatar-local day bounds as Date for ADMS DATA QUERY ATTLOG. */
export function qatarRangeToFetchWindow(dateFrom: string, dateTo: string): { from: Date; to: Date } {
  const from = new Date(`${dateFrom.slice(0, 10)}T00:00:00+03:00`);
  const to = new Date(`${dateTo.slice(0, 10)}T23:59:59+03:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid date range for device fetch.");
  }
  return { from, to };
}

function asYmd(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Scan a site for likely missing attendance display:
 * rostered absences, days where every raw punch is excluded (false duplicates),
 * and single-punch days.
 */
export async function findAttendanceGaps(
  supabase: AuthContext["supabase"],
  input: { locationId: string; dateFrom: string; dateTo: string; dates?: string[] },
): Promise<AttendanceGapReport> {
  const dateFrom = input.dateFrom.slice(0, 10);
  const dateTo = input.dateTo.slice(0, 10);
  const dateFilter = input.dates?.length ? new Set(input.dates.map((d) => d.slice(0, 10))) : null;

  const [{ data: summaries, error: sumErr }, { data: logs, error: logErr }, { data: roster, error: rosErr }] =
    await Promise.all([
      supabase
        .from("attendance_daily_summary")
        .select("staff_id, biometric_user_id, work_date, status, punch_count, actual_in, actual_out")
        .eq("location_id", input.locationId)
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo),
      supabase
        .from("attendance_logs")
        .select("staff_id, biometric_user_id, attendance_date, excluded_from_calc, probable_duplicate")
        .eq("location_id", input.locationId)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo),
      supabase
        .from("attendance_roster_assignments")
        .select("staff_id, work_date, is_week_off")
        .eq("location_id", input.locationId)
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .eq("is_week_off", false),
    ]);
  if (sumErr) throw sumErr;
  if (logErr) throw logErr;
  if (rosErr) throw rosErr;

  const staffIds = new Set<string>();
  for (const row of summaries ?? []) if (row.staff_id) staffIds.add(String(row.staff_id));
  for (const row of roster ?? []) if (row.staff_id) staffIds.add(String(row.staff_id));
  for (const row of logs ?? []) if (row.staff_id) staffIds.add(String(row.staff_id));

  const staffNameById = new Map<string, { name: string | null; code: string | null }>();
  if (staffIds.size) {
    const { data: staffRows } = await supabase
      .from("staff")
      .select("id, full_name, employee_code")
      .in("id", [...staffIds]);
    for (const s of staffRows ?? []) {
      staffNameById.set(String(s.id), {
        name: s.full_name ? String(s.full_name) : null,
        code: s.employee_code ? String(s.employee_code) : null,
      });
    }
  }

  type PunchAgg = { raw: number; excluded: number; valid: number };
  const punchByKey = new Map<string, PunchAgg>();
  for (const log of logs ?? []) {
    const day = asYmd(log.attendance_date);
    if (!day || (dateFilter && !dateFilter.has(day))) continue;
    const subject = log.staff_id ? `staff:${log.staff_id}` : `bio:${log.biometric_user_id ?? ""}`;
    const key = `${subject}|${day}`;
    const agg = punchByKey.get(key) ?? { raw: 0, excluded: 0, valid: 0 };
    agg.raw += 1;
    if (log.excluded_from_calc || log.probable_duplicate) agg.excluded += 1;
    else agg.valid += 1;
    punchByKey.set(key, agg);
  }

  const rosterKeys = new Set(
    (roster ?? [])
      .map((r) => {
        const day = asYmd(r.work_date);
        if (!day || (dateFilter && !dateFilter.has(day))) return null;
        return `${r.staff_id}|${day}`;
      })
      .filter(Boolean) as string[],
  );

  const gaps: AttendanceGapRow[] = [];
  const seen = new Set<string>();

  for (const row of summaries ?? []) {
    const day = asYmd(row.work_date);
    if (!day || (dateFilter && !dateFilter.has(day))) continue;
    const staffId = row.staff_id ? String(row.staff_id) : null;
    const subject = staffId ? `staff:${staffId}` : `bio:${row.biometric_user_id ?? ""}`;
    const punchKey = `${subject}|${day}`;
    const gapKey = `${staffId ?? subject}|${day}`;
    if (seen.has(gapKey)) continue;

    const punches = punchByKey.get(punchKey) ?? { raw: 0, excluded: 0, valid: 0 };
    const status = row.status ? String(row.status) : null;
    const validCount = Number(row.punch_count ?? punches.valid) || 0;
    const rostered = staffId ? rosterKeys.has(`${staffId}|${day}`) : false;
    const staffMeta = staffId ? staffNameById.get(staffId) : undefined;

    let kind: AttendanceGapKind | null = null;
    if (punches.raw > 0 && punches.valid === 0) {
      kind = "all_punches_excluded";
    } else if (rostered && (status === "absent" || validCount === 0) && !row.actual_in) {
      kind = "absent_rostered";
    } else if (status === "missed_punch" || (validCount === 1 && !row.actual_out)) {
      kind = "missed_punch";
    } else if (rostered && !row.actual_in && punches.raw === 0) {
      kind = "no_in";
    }

    if (!kind) continue;
    seen.add(gapKey);
    gaps.push({
      workDate: day,
      staffId,
      staffName: staffMeta?.name ?? null,
      employeeCode: staffMeta?.code ?? null,
      biometricUserId: row.biometric_user_id ? String(row.biometric_user_id) : null,
      kind,
      status,
      rawPunchCount: punches.raw,
      validPunchCount: punches.valid,
      excludedPunchCount: punches.excluded,
    });
  }

  // Rostered staff with no summary row at all
  for (const key of rosterKeys) {
    if (seen.has(key)) continue;
    const [staffId, day] = key.split("|");
    const punchKey = `staff:${staffId}|${day}`;
    const punches = punchByKey.get(punchKey) ?? { raw: 0, excluded: 0, valid: 0 };
    if (punches.valid > 0) continue;
    const staffMeta = staffNameById.get(staffId);
    const kind: AttendanceGapKind =
      punches.raw > 0 && punches.valid === 0 ? "all_punches_excluded" : "absent_rostered";
    seen.add(key);
    gaps.push({
      workDate: day,
      staffId,
      staffName: staffMeta?.name ?? null,
      employeeCode: staffMeta?.code ?? null,
      biometricUserId: null,
      kind,
      status: null,
      rawPunchCount: punches.raw,
      validPunchCount: punches.valid,
      excludedPunchCount: punches.excluded,
    });
  }

  gaps.sort((a, b) => a.workDate.localeCompare(b.workDate) || (a.staffName ?? "").localeCompare(b.staffName ?? ""));

  const absentRostered = gaps.filter((g) => g.kind === "absent_rostered" || g.kind === "no_in").length;
  const allExcluded = gaps.filter((g) => g.kind === "all_punches_excluded").length;
  const missedPunch = gaps.filter((g) => g.kind === "missed_punch").length;

  return {
    locationId: input.locationId,
    dateFrom,
    dateTo,
    gaps: gaps.slice(0, 200),
    totals: {
      gaps: gaps.length,
      absentRostered,
      allExcluded,
      missedPunch,
    },
    reprocessLikelyHelps: allExcluded > 0,
    deviceFetchLikelyHelps: absentRostered > 0 || gaps.some((g) => g.rawPunchCount === 0),
  };
}
