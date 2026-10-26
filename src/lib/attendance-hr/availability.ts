import { enumerateYmd } from "./roster-period";
import { computeSharedAttendanceKpis, type AttendanceSharedKpiInput } from "./shared-kpis";

export type AvailabilityBucket = {
  present: number;
  absent: number;
  late: number;
  visits: number;
};

export type AvailabilityTrends = {
  history: AvailabilityBucket;
  current: AvailabilityBucket;
  upcoming: { rostered: number; weekOff: number };
};

export const EMPTY_AVAILABILITY_BUCKET: AvailabilityBucket = {
  present: 0,
  absent: 0,
  late: 0,
  visits: 0,
};

export function emptyAvailabilityTrends(): AvailabilityTrends {
  return {
    history: { ...EMPTY_AVAILABILITY_BUCKET },
    current: { ...EMPTY_AVAILABILITY_BUCKET },
    upcoming: { rostered: 0, weekOff: 0 },
  };
}

function addUtcDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Same-length window immediately before dateFrom. */
export function previousPeriod(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  const days = enumerateYmd(dateFrom, dateTo).length || 1;
  return {
    dateFrom: addUtcDays(dateFrom, -days),
    dateTo: addUtcDays(dateFrom, -1),
  };
}

export function upcomingPeriod(dateTo: string, days = 7): { dateFrom: string; dateTo: string } {
  const from = addUtcDays(dateTo, 1);
  return { dateFrom: from, dateTo: addUtcDays(from, days - 1) };
}

export type DayStatusRow = AttendanceSharedKpiInput & {
  status?: string | null;
};

export function tallyAvailability(rows: DayStatusRow[], visits = 0): AvailabilityBucket {
  const kpis = computeSharedAttendanceKpis(
    rows.map((row) => ({
      ...row,
      status: String(row.status ?? ""),
    })),
  );
  return { present: kpis.present, absent: kpis.absent, late: kpis.late, visits };
}

export function tallyUpcomingRoster(rows: Array<{ is_week_off?: boolean | null }>): { rostered: number; weekOff: number } {
  let rostered = 0;
  let weekOff = 0;
  for (const row of rows) {
    if (row.is_week_off) weekOff += 1;
    else rostered += 1;
  }
  return { rostered, weekOff };
}

export function buildAvailabilityTrends(input: {
  historyRows: DayStatusRow[];
  currentRows: DayStatusRow[];
  historyVisits?: number;
  currentVisits?: number;
  upcomingRows?: Array<{ is_week_off?: boolean | null }>;
}): AvailabilityTrends {
  return {
    history: tallyAvailability(input.historyRows, input.historyVisits ?? 0),
    current: tallyAvailability(input.currentRows, input.currentVisits ?? 0),
    upcoming: tallyUpcomingRoster(input.upcomingRows ?? []),
  };
}
