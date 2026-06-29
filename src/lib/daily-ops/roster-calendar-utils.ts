import type { SupportedLanguage } from "@/i18n";

export type RosterShiftRow = {
  id?: unknown;
  starts_at: string;
  ends_at: string;
  role_label: string | null;
  status: string;
  staff: { full_name: string; employee_code: string } | null;
  location?: { code: string } | null;
};

export type RosterUploadRow = {
  period_start: string | null;
  period_end: string | null;
};

export type CalendarDayCell = {
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
};

/** English: Sunday start; Arabic: Saturday start (GCC). */
export function rosterWeekStartsOn(language: SupportedLanguage): 0 | 6 {
  return language === "ar" ? 6 : 0;
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

export function formatYearMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function addMonths(ym: string, delta: number): string {
  const { year, month } = parseYearMonth(ym);
  const d = new Date(year, month - 1 + delta, 1);
  return formatYearMonth(d);
}

export function monthDateRange(ym: string): { from: string; to: string } {
  const { year, month } = parseYearMonth(ym);
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildMonthWeeks(ym: string, weekStartsOn: 0 | 6): CalendarDayCell[][] {
  const { year, month } = parseYearMonth(ym);
  const lastDay = new Date(year, month, 0).getDate();
  const today = toDateStr(new Date());
  const firstDow = new Date(year, month - 1, 1).getDay();
  const leading = (firstDow - weekStartsOn + 7) % 7;

  const weeks: CalendarDayCell[][] = [];
  let week: CalendarDayCell[] = [];

  if (leading > 0) {
    const prevLast = new Date(year, month - 1, 0);
    for (let i = leading - 1; i >= 0; i--) {
      const d = new Date(prevLast);
      d.setDate(prevLast.getDate() - i);
      const ds = toDateStr(d);
      week.push({ date: ds, dayOfMonth: d.getDate(), inMonth: false, isToday: ds === today });
    }
  }

  for (let dayNum = 1; dayNum <= lastDay; dayNum++) {
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    const ds = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    week.push({ date: ds, dayOfMonth: dayNum, inMonth: true, isToday: ds === today });
  }

  if (week.length > 0) {
    let nextDay = 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    while (week.length < 7) {
      const ds = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
      week.push({ date: ds, dayOfMonth: nextDay, inMonth: false, isToday: ds === today });
      nextDay++;
    }
    weeks.push(week);
  }

  return weeks;
}

export function weekdayLabels(language: SupportedLanguage, weekStartsOn: 0 | 6): string[] {
  const locale = language === "ar" ? "ar" : "en-US";
  const refSunday = new Date(2024, 0, 7);
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dow = (weekStartsOn + i) % 7;
    const d = new Date(refSunday);
    d.setDate(refSunday.getDate() + dow);
    labels.push(d.toLocaleDateString(locale, { weekday: "short" }));
  }
  return labels;
}

export function formatMonthTitle(ym: string, language: SupportedLanguage): string {
  const { year, month } = parseYearMonth(ym);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(language === "ar" ? "ar" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

export function groupShiftsByDate(shifts: RosterShiftRow[]): Map<string, RosterShiftRow[]> {
  const map = new Map<string, RosterShiftRow[]>();
  for (const s of shifts) {
    const key = s.starts_at.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  return map;
}

export function dateInUploadPeriod(date: string, uploads: RosterUploadRow[]): boolean {
  return uploads.some((u) => {
    if (!u.period_start || !u.period_end) return false;
    return date >= String(u.period_start) && date <= String(u.period_end);
  });
}

export function weekHasRosterUpload(weekDates: string[], uploads: RosterUploadRow[]): boolean {
  return weekDates.some((d) => dateInUploadPeriod(d, uploads));
}

export function isCurrentWeek(weekDates: string[], today: string): boolean {
  return weekDates.includes(today);
}

export function formatShiftTime(iso: string): string {
  return iso.slice(11, 16);
}

/** Inclusive week containing refDate; weekStartsOn 0 = Sunday, 6 = Saturday. */
export function weekRangeContaining(
  refDate: string,
  weekStartsOn: 0 | 6,
): { from: string; to: string } {
  const d = new Date(`${refDate}T12:00:00`);
  const dow = d.getDay();
  const offset = (dow - weekStartsOn + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: toDateStr(start), to: toDateStr(end) };
}
