/**
 * Decides how an ADMS upload should recalculate. Not called from ingest yet.
 * Full-site recalculation stays the path for unmapped punches and wide uploads.
 */

export const ADMS_RECALC_STAFF_LIMIT = 200;
/** One extra day on each side so an overnight pair split by the 06:00 cutoff stays in range. */
export const ADMS_RECALC_OVERNIGHT_PAD_DAYS = 1;

export type AdmsInsertedPunch = {
  staff_id: string | null;
  attendance_date: string | null;
};

export type AdmsRecalcPlan =
  | { mode: "skip" }
  | {
      mode: "full_site";
      dateFrom: string;
      dateTo: string;
      reason: "unmapped_punch" | "wide_staff_set";
    }
  | {
      mode: "staff";
      staffIds: string[];
      dateFrom: string;
      dateTo: string;
      includeUnmappedPunches: false;
    };

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function dateSpan(rows: AdmsInsertedPunch[]): { dateFrom: string; dateTo: string } | null {
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  for (const row of rows) {
    const day = row.attendance_date?.slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!dateFrom || day < dateFrom) dateFrom = day;
    if (!dateTo || day > dateTo) dateTo = day;
  }
  if (!dateFrom || !dateTo) return null;
  return { dateFrom, dateTo };
}

/**
 * Plan from punches that were newly inserted. Duplicate conflicts are omitted
 * by the caller, matching today's rule that a duplicate-only upload does not recalculate.
 */
export function planAdmsRecalc(inserted: AdmsInsertedPunch[]): AdmsRecalcPlan {
  const span = dateSpan(inserted);
  if (!span) return { mode: "skip" };

  const unmapped = inserted.some((row) => !row.staff_id?.trim());
  if (unmapped) {
    return { mode: "full_site", ...span, reason: "unmapped_punch" };
  }

  const staffIds = [...new Set(inserted.map((row) => row.staff_id?.trim() ?? "").filter(Boolean))].sort();
  if (staffIds.length > ADMS_RECALC_STAFF_LIMIT) {
    return { mode: "full_site", ...span, reason: "wide_staff_set" };
  }

  return {
    mode: "staff",
    staffIds,
    dateFrom: addDays(span.dateFrom, -ADMS_RECALC_OVERNIGHT_PAD_DAYS),
    dateTo: addDays(span.dateTo, ADMS_RECALC_OVERNIGHT_PAD_DAYS),
    includeUnmappedPunches: false,
  };
}
