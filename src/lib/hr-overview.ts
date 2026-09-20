/**
 * HR dashboard aggregators (Phase 11). Pure — empty-safe, no Supabase.
 */

export type NamedCount = { key: string; label: string; count: number };

export type HrOverviewBreakdowns = {
  byCategory: NamedCount[];
  byDepartment: NamedCount[];
  byLocation: NamedCount[];
};

/** Empty shell so UI/tests never throw when queries return nothing. */
export function emptyHrOverviewBreakdowns(): HrOverviewBreakdowns {
  return { byCategory: [], byDepartment: [], byLocation: [] };
}

function bump(map: Map<string, NamedCount>, key: string | null | undefined, label?: string | null) {
  const k = (key && String(key).trim()) || "unassigned";
  const lbl = (label && String(label).trim()) || k;
  const cur = map.get(k) ?? { key: k, label: lbl, count: 0 };
  cur.count += 1;
  if (label && String(label).trim()) cur.label = String(label).trim();
  map.set(k, cur);
}

export function aggregateHrHeadcountBreakdowns(
  rows: Array<{
    employmentCategory?: string | null;
    departmentId?: string | null;
    departmentName?: string | null;
    locationId?: string | null;
    locationCode?: string | null;
    locationName?: string | null;
  }>,
): HrOverviewBreakdowns {
  if (!rows?.length) return emptyHrOverviewBreakdowns();
  const byCat = new Map<string, NamedCount>();
  const byDept = new Map<string, NamedCount>();
  const byLoc = new Map<string, NamedCount>();
  for (const row of rows) {
    bump(byCat, row.employmentCategory, row.employmentCategory);
    bump(byDept, row.departmentId, row.departmentName);
    const locLabel =
      [row.locationCode, row.locationName].filter(Boolean).join(" — ") || row.locationName || row.locationCode;
    bump(byLoc, row.locationId, locLabel);
  }
  const sort = (a: NamedCount, b: NamedCount) => b.count - a.count || a.label.localeCompare(b.label);
  return {
    byCategory: [...byCat.values()].sort(sort),
    byDepartment: [...byDept.values()].sort(sort),
    byLocation: [...byLoc.values()].sort(sort),
  };
}

/** Staff with no CV on file among active roster. */
export function countMissingCvStaff(
  staffIds: string[],
  docs: Array<{ staffId: string; docType: string; deletedAt?: string | null }>,
): number {
  if (!staffIds.length) return 0;
  const withCv = new Set(
    docs.filter((d) => !d.deletedAt && d.docType === "cv").map((d) => d.staffId),
  );
  return staffIds.filter((id) => !withCv.has(id)).length;
}

/** Educational certificates not MOFA-attested (excludes not_required). */
export function countUnattestedEducationalDocs(
  docs: Array<{ docType: string; mofaStatus?: string | null; deletedAt?: string | null }>,
): number {
  let n = 0;
  for (const d of docs ?? []) {
    if (d.deletedAt) continue;
    if (d.docType !== "educational_certificate") continue;
    const m = (d.mofaStatus ?? "no").toLowerCase();
    if (m === "yes" || m === "not_required") continue;
    n += 1;
  }
  return n;
}

export function countExpiringDocType(
  docs: Array<{ docType: string; expiryDate?: string | null; deletedAt?: string | null }>,
  docType: string,
  todayYmd: string,
  horizonYmd: string,
): number {
  let n = 0;
  const today = todayYmd.slice(0, 10);
  const horizon = horizonYmd.slice(0, 10);
  for (const d of docs ?? []) {
    if (d.deletedAt || d.docType !== docType || !d.expiryDate) continue;
    const exp = String(d.expiryDate).slice(0, 10);
    if (exp >= today && exp <= horizon) n += 1;
  }
  return n;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00+03:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

/** Hire dates in [today, today+horizon]. */
export function countJoiningSoon(
  rows: Array<{ hireDate?: string | null; status?: string | null }>,
  todayYmd: string,
  horizonDays = 30,
): number {
  const today = todayYmd.slice(0, 10);
  const to = addDaysYmd(today, horizonDays);
  let n = 0;
  for (const r of rows ?? []) {
    if (!r.hireDate) continue;
    const h = String(r.hireDate).slice(0, 10);
    if (h < today || h > to) continue;
    const st = (r.status ?? "active").toLowerCase();
    if (st === "terminated" || st === "resigned") continue;
    n += 1;
  }
  return n;
}

/** last_working_date in [today, today+horizon]. */
export function countLeavingSoon(
  rows: Array<{ lastWorkingDate?: string | null }>,
  todayYmd: string,
  horizonDays = 30,
): number {
  const today = todayYmd.slice(0, 10);
  const to = addDaysYmd(today, horizonDays);
  let n = 0;
  for (const r of rows ?? []) {
    if (!r.lastWorkingDate) continue;
    const d = String(r.lastWorkingDate).slice(0, 10);
    if (d >= today && d <= to) n += 1;
  }
  return n;
}
