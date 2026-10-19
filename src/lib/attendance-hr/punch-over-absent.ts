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
