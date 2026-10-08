/** Display rules for the workforce workbench. No writes. */

export const WORKFORCE_DAYS = 14;
export const RENEWAL_WINDOW_DAYS = 30;

export const WORKFORCE_TABS = ["workspace", "locations", "bulk", "offers", "staffing", "renewals"] as const;
export type WorkforceTab = (typeof WORKFORCE_TABS)[number];

const TAB_ALIASES: Record<string, WorkforceTab> = {
  team: "workspace",
  roster: "bulk",
  mine: "offers",
  qualifications: "staffing",
  availability: "staffing",
};

/** Certificate files already stored on employee documents. Not a separate type catalogue. */
export const QUALIFICATION_DOC_TYPES = [
  "educational_certificate",
  "mofa_attested_certificate",
  "medical_certificate",
] as const;

export function workforceTab(value: string | null | undefined): WorkforceTab {
  if (!value) return "workspace";
  if ((WORKFORCE_TABS as readonly string[]).includes(value)) return value as WorkforceTab;
  return TAB_ALIASES[value] ?? "workspace";
}

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function windowEnd(start: string): string {
  return addCalendarDays(start, WORKFORCE_DAYS - 1);
}

export function qatarToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Inclusive Qatar-local bounds for a shift query. */
export function qatarDayBounds(startYmd: string, endYmd: string): { from: string; to: string } {
  return {
    from: new Date(`${startYmd}T00:00:00+03:00`).toISOString(),
    to: new Date(`${endYmd}T23:59:59.999+03:00`).toISOString(),
  };
}

export function isCancelledShift(status: string): boolean {
  const value = status.toLowerCase();
  return value === "cancelled" || value === "canceled";
}

export function shiftCoverage(shifts: Array<{ staffId: string | null; status: string }>): {
  accepted: number;
  open: number;
} {
  let accepted = 0;
  let open = 0;
  for (const shift of shifts) {
    if (isCancelledShift(shift.status)) continue;
    if (shift.staffId) accepted += 1;
    else open += 1;
  }
  return { accepted, open };
}

/** Quiet summary only when there is something to count. Zeros stay off the page. */
export function showCoverageSummary(counts: { accepted: number; open: number }): boolean {
  return counts.accepted > 0 || counts.open > 0;
}

export function locationPlace(city: string | null | undefined, region: string | null | undefined): string | null {
  const parts = [city?.trim(), region?.trim()].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

export function locationRegions(sites: Array<{ region: string | null }>): string[] {
  return [...new Set(sites.map((site) => site.region?.trim()).filter((region): region is string => Boolean(region)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export function filterLocations<
  T extends { name: string; code: string; city: string | null; region: string | null },
>(sites: T[], query: string, region: string): T[] {
  const needle = query.trim().toLowerCase();
  return sites.filter((site) => {
    const siteRegion = site.region?.trim() || "";
    if (region === "uncategorized") {
      if (siteRegion) return false;
    } else if (region !== "all" && siteRegion !== region) return false;
    if (!needle) return true;
    return [site.name, site.code, site.city, site.region]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

export function rosterDays<T extends { workDate: string }>(rows: T[]): Array<{ date: string; rows: T[] }> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.workDate) ?? [];
    list.push(row);
    map.set(row.workDate, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => ({ date, rows: dayRows }));
}

export function isQualificationRecord(doc: { docType: string; qualification?: string | null }): boolean {
  if (doc.qualification?.trim()) return true;
  return (QUALIFICATION_DOC_TYPES as readonly string[]).includes(doc.docType);
}

export function dueQualifications<
  T extends { docType: string; qualification?: string | null; expiryDate: string | null },
>(docs: T[], today: string, withinDays = RENEWAL_WINDOW_DAYS): T[] {
  const limit = addCalendarDays(today, withinDays);
  return docs
    .filter((doc) => isQualificationRecord(doc) && doc.expiryDate != null && doc.expiryDate <= limit)
    .slice()
    .sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)));
}

export function staffSearchReady(query: string): boolean {
  return query.trim().length >= 2;
}

export function filterStaffByQuery<T extends { fullName: string; employeeCode: string | null }>(
  people: T[],
  query: string,
): T[] {
  if (!staffSearchReady(query)) return [];
  const needle = query.trim().toLowerCase();
  return people.filter((person) =>
    [person.fullName, person.employeeCode].filter(Boolean).join(" ").toLowerCase().includes(needle),
  );
}

export type ShiftMine = {
  userId: string | null;
  status: string;
  swapRequestedAt: string | null;
  swapRequestedFor: string | null;
};

export function splitMyShifts<T extends ShiftMine>(shifts: T[], userId: string): { mine: T[]; offers: T[] } {
  const mine: T[] = [];
  const offers: T[] = [];
  for (const shift of shifts) {
    if (isCancelledShift(shift.status)) continue;
    const assignedToMe = shift.userId === userId;
    const offeredToMe = Boolean(shift.swapRequestedAt) && shift.swapRequestedFor === userId && !assignedToMe;
    const offeredByMe = assignedToMe && Boolean(shift.swapRequestedAt);
    if (offeredByMe || offeredToMe) offers.push(shift);
    else if (assignedToMe) mine.push(shift);
  }
  return { mine, offers };
}

const PENDING_OFFER = new Set(["pending", "offered", "offer", "awaiting", "awaiting_response"]);

/** A swap request or an offer status does not fill a place. */
export function isPendingOffer(shift: { status: string; swapRequestedAt?: string | null }): boolean {
  if (shift.swapRequestedAt) return true;
  return PENDING_OFFER.has(shift.status.trim().toLowerCase());
}

export type PlaceCounts = {
  upcomingLive: number;
  accepted: number;
  total: number;
  unfilled: number;
  awaiting: number;
};

/**
 * Counts for the open 14-day window.
 * Upcoming & live = a shift that has not ended.
 * Accepted = a person is assigned and the shift is not a pending offer.
 * Unfilled = no person, and not a pending offer.
 * Awaiting = a pending offer. Those do not count as accepted.
 */
export function placeCounts(
  shifts: Array<{
    staffId: string | null;
    status: string;
    startsAt: string;
    endsAt: string;
    swapRequestedAt?: string | null;
  }>,
  nowMs: number,
): PlaceCounts {
  let upcomingLive = 0;
  let accepted = 0;
  let unfilled = 0;
  let awaiting = 0;
  for (const shift of shifts) {
    if (isCancelledShift(shift.status)) continue;
    const end = Date.parse(shift.endsAt);
    if (Number.isFinite(end) && end >= nowMs) upcomingLive += 1;
    if (isPendingOffer(shift)) {
      awaiting += 1;
      continue;
    }
    if (shift.staffId) accepted += 1;
    else unfilled += 1;
  }
  return { upcomingLive, accepted, total: accepted + unfilled + awaiting, unfilled, awaiting };
}

/** Roster days that name a person and are not already an accepted shift on that day. */
export function extraRosterPlaces(
  roster: Array<{ staffId: string; workDate: string; isWeekOff: boolean; leaveType: string | null }>,
  shifts: Array<{ staffId: string | null; status: string; day: string; swapRequestedAt?: string | null }>,
): number {
  const covered = new Set<string>();
  for (const shift of shifts) {
    if (isCancelledShift(shift.status) || isPendingOffer(shift) || !shift.staffId) continue;
    covered.add(`${shift.staffId}|${shift.day}`);
  }
  let count = 0;
  for (const row of roster) {
    if (row.isWeekOff || row.leaveType) continue;
    if (covered.has(`${row.staffId}|${row.workDate}`)) continue;
    count += 1;
  }
  return count;
}

export function shiftFormError(start: string, end: string): "required" | "order" | null {
  if (!start || !end) return "required";
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return "order";
  return null;
}
