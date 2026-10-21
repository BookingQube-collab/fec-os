/**
 * Guards so a person-day with device punches never stays Absent.
 * Used by process upsert dedupe and listing cleanup.
 */

export type PunchPreferableSummary = {
  location_id?: unknown;
  staff_id?: unknown;
  work_date?: unknown;
  status?: unknown;
  punch_count?: unknown;
  actual_in?: unknown;
  actual_out?: unknown;
};

function summaryKey(row: PunchPreferableSummary): string | null {
  const loc = String(row.location_id ?? "").trim();
  const staffId = String(row.staff_id ?? "").trim();
  const day = String(row.work_date ?? "").slice(0, 10);
  if (!loc || !staffId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return `${loc}|${staffId}|${day}`;
}

function usablePunchScore(row: PunchPreferableSummary): number {
  const count = Number(row.punch_count ?? 0);
  const hasIn = Boolean(row.actual_in);
  const hasOut = Boolean(row.actual_out);
  if (Number.isFinite(count) && count > 0) return count + (hasIn ? 1 : 0) + (hasOut ? 1 : 0);
  return (hasIn ? 2 : 0) + (hasOut ? 2 : 0);
}

function looksAbsentStatus(status: unknown): boolean {
  const key = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return !key || key === "absent";
}

/**
 * One row per location|staff|day. Prefer the row that carries punches so a
 * roster Absent filler never overwrites Present/Missed punch in the same batch.
 */
export function preferPunchedDailySummaryRows<T extends PunchPreferableSummary>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = summaryKey(row);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const prevScore = usablePunchScore(prev);
    const nextScore = usablePunchScore(row);
    if (nextScore > prevScore) {
      byKey.set(key, row);
      continue;
    }
    if (nextScore === prevScore && looksAbsentStatus(prev.status) && !looksAbsentStatus(row.status)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function rowHasUsablePunch(row: {
  actual_in?: unknown;
  actual_out?: unknown;
  punch_count?: unknown;
}): boolean {
  if (row.actual_in || row.actual_out) return true;
  return Number(row.punch_count ?? 0) > 0;
}

/**
 * Drop punch-less Absent when the same person-day already has a punched row
 * at any site (Ronald rostered KDS + punched INF; Agnes stale Absent + Present).
 */
export function suppressAbsentWhenPunchedSameDay(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (rows.length < 2) return rows;
  const punchedKeys = new Set<string>();
  for (const row of rows) {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !day || !rowHasUsablePunch(row)) continue;
    punchedKeys.add(`${staffId}|${day}`);
  }
  if (!punchedKeys.size) return rows;
  return rows.filter((row) => {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !day) return true;
    if (rowHasUsablePunch(row) || !looksAbsentStatus(row.status)) return true;
    return !punchedKeys.has(`${staffId}|${day}`);
  });
}

function punchSpanKey(row: {
  actual_in?: unknown;
  actual_out?: unknown;
}): string | null {
  const inn = row.actual_in == null ? "" : String(row.actual_in);
  const out = row.actual_out == null ? "" : String(row.actual_out);
  if (!inn && !out) return null;
  return `${inn}|${out}`;
}

/**
 * After biometric map → recalc, process upserts a `staff:{id}` daily row but often
 * leaves the prior unmapped `bio:device:user` row. Listing/export then show both
 * (e.g. device name "Fahadah" with empty code beside "Fahadha mohamed nur" UA-DM-STF22
 * with identical punches). Drop the orphan unmapped row when a mapped sibling
 * covers the same location + day for the same biometric user, or the same punch span.
 */
export function suppressUnmappedWhenMappedSameDay(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (rows.length < 2) return rows;

  const mappedBioKeys = new Set<string>();
  const mappedPunchKeys = new Set<string>();
  for (const row of rows) {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    if (!staffId) continue;
    const loc = String(row.location_id ?? "").trim();
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!loc || !day) continue;
    const bio = String(row.biometric_user_id ?? "").trim();
    if (bio) mappedBioKeys.add(`${loc}|${day}|${bio}`);
    const punch = punchSpanKey(row);
    if (punch) mappedPunchKeys.add(`${loc}|${day}|${punch}`);
  }
  if (!mappedBioKeys.size && !mappedPunchKeys.size) return rows;

  return rows.filter((row) => {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    if (staffId) return true;
    const loc = String(row.location_id ?? "").trim();
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!loc || !day) return true;
    const bio = String(row.biometric_user_id ?? "").trim();
    if (bio && mappedBioKeys.has(`${loc}|${day}|${bio}`)) return false;
    const punch = punchSpanKey(row);
    if (punch && mappedPunchKeys.has(`${loc}|${day}|${punch}`)) return false;
    return true;
  });
}

export type RosterDutyDay = {
  staff_id: string;
  work_date: string;
  is_week_off: boolean;
};

/**
 * Punch-less Absent requires an on-duty roster that day.
 * Ruben (unrostered) must not show ABSENT INF-CC; week-off-only becomes weekly_off.
 */
export function suppressAbsentWithoutOnDutyRoster(input: {
  rows: Array<Record<string, unknown>>;
  roster: readonly RosterDutyDay[];
}): Array<Record<string, unknown>> {
  if (input.rows.length === 0) return input.rows;

  const onDutyKeys = new Set<string>();
  const weekOffKeys = new Set<string>();
  for (const r of input.roster) {
    const staffId = String(r.staff_id ?? "").trim();
    const day = String(r.work_date ?? "").slice(0, 10);
    if (!staffId || !day) continue;
    const key = `${staffId}|${day}`;
    if (r.is_week_off) weekOffKeys.add(key);
    else onDutyKeys.add(key);
  }

  const out: Array<Record<string, unknown>> = [];
  for (const row of input.rows) {
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    const day = String(row.work_date ?? "").slice(0, 10);
    if (!staffId || !day || rowHasUsablePunch(row) || !looksAbsentStatus(row.status)) {
      out.push(row);
      continue;
    }
    const key = `${staffId}|${day}`;
    if (onDutyKeys.has(key)) {
      out.push(row);
      continue;
    }
    if (weekOffKeys.has(key)) {
      out.push({
        ...row,
        status: "weekly_off",
        missed_punch: false,
        late_minutes: 0,
        worked_minutes: 0,
      });
      continue;
    }
    // No roster that day — drop false Absent (e.g. Ruben Yaralyan INF-CC).
  }
  return out;
}
