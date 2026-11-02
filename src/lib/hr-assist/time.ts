/** Calendar helpers for HR review notes. Qatar is UTC+3 with no daylight saving. */

export function ymdAdd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return ymd.slice(0, 10);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekdayIndex(ymd: string): number {
  const t = Date.parse(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return 0;
  return new Date(t).getUTCDay();
}

export function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${toYmd.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function datesBetween(fromYmd: string, toYmd: string, max = 31): string[] {
  const out: string[] = [];
  let cur = fromYmd.slice(0, 10);
  const end = toYmd.slice(0, 10);
  if (!cur || !end || end < cur) return out;
  while (cur <= end && out.length < max) {
    out.push(cur);
    cur = ymdAdd(cur, 1);
  }
  return out;
}

export function median(nums: readonly number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value);
}

export function hmToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const match = String(hm).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function normalizeHm(value: string | null | undefined): string | null {
  const mins = hmToMinutes(value);
  if (mins == null) return null;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function qatarYmd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);
}

export function qatarHm24(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const q = new Date(t + 3 * 3_600_000);
  return `${String(q.getUTCHours()).padStart(2, "0")}:${String(q.getUTCMinutes()).padStart(2, "0")}`;
}

export type Hm12Parts = {
  hour12: number;
  minute: number;
  period: "AM" | "PM";
};

/** Split a 24-hour HH:mm string into 12-hour clock parts. */
export function splitHm12(hm: string | null | undefined): Hm12Parts | null {
  const mins = hmToMinutes(hm);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    hour12: h % 12 || 12,
    minute: m,
    period: h >= 12 ? "PM" : "AM",
  };
}

/**
 * Join 12-hour clock parts into a 24-hour HH:mm string.
 * 12 AM → 00:xx, 12 PM → 12:xx, 1 PM → 13:xx (never map 12 PM to 00:00).
 */
export function joinHm12(hour12: number, minute: number, period: "AM" | "PM"): string {
  const rawHour = Math.trunc(Number(hour12));
  const m = Math.min(59, Math.max(0, Math.trunc(Number(minute)) || 0));
  // Accept only 1–12; out-of-range falls back to 12 so AM→00 / PM→12 stay valid.
  const h12 = rawHour >= 1 && rawHour <= 12 ? rawHour : 12;
  // 12 o'clock is 0 in 24h math; AM stays 0–11, PM adds 12 → 12–23.
  let h24 = h12 % 12;
  if (period === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 12-hour English label from a 24-hour HH:mm string. */
export function formatEnglishTime(hm: string): string {
  const parts = splitHm12(hm);
  if (!parts) return hm;
  return `${parts.hour12}:${String(parts.minute).padStart(2, "0")} ${parts.period}`;
}

export function shiftSpanMinutes(actualIn: string, actualOut: string): number | null {
  const a = Date.parse(actualIn);
  const b = Date.parse(actualOut);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let diff = Math.round((b - a) / 60_000);
  if (diff < 0) diff += 24 * 60;
  return diff;
}
