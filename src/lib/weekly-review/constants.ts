export const AGGREGATOR_PLATFORMS = ["Entertainer", "Urban Point", "DealsGo", "MyBook"] as const;
export type AggregatorPlatform = (typeof AGGREGATOR_PLATFORMS)[number];

/** Sep 2026 weekly pace (redemptions). */
export const AGGREGATOR_WEEKLY_PACE: Record<AggregatorPlatform, number> = {
  Entertainer: 13,
  "Urban Point": 119,
  DealsGo: 17,
  MyBook: 43,
};

/** Meeting-pack company suggestions (additive). Full master lives in corporate_deal_partners. */
export const CORPORATE_PARTNERS = [
  "Al Jazeera Imtiyazat",
  "My Book",
  "QIB",
  "Dar App",
  "Qatar Airways",
  "Entertainer",
  "Public Health Sector (Sogha)",
  "Urban Point",
  "Qatar Living Deals",
  "Imtyazat",
  "Classmate",
  "MyBenefit",
  "DHL",
  "Qatar Foundation",
  "Qatar Investment Authority",
  "Bein",
  "Huawei",
  "Aspire",
  "Qatar Media Corporation",
  "QNB Rewards",
  "Snoonu",
  "Snoonu Employees",
] as const;

/** In-app Corporate Deals Weekly Report (replaces external sheet link). */
export const CORPORATE_DEALS_SHEET_URL = "/operations/corporate-deals";

export const INSTAGRAM_HANDLES: Record<string, string> = {
  "INF-CC": "@inflata_park",
  "KDS-CC": "@citykidsdriving",
  "UA-DM": "@urbanarenaqa",
};

export const AGGREGATOR_LOCATION_CODES = ["INF-CC", "KDS-CC", "UA-DM", "CB-DSM", "CB-VM"] as const;
export const CAMPAIGN_LOCATION_CODES = ["INF-CC", "KDS-CC", "UA-DM"] as const;
export const INCIDENT_LOCATION_CODES = ["INF-CC", "KDS-CC", "UA-DM", "CB-DSM", "CB-VM", "KDS-DM"] as const;

export const LOCATION_SHORT_NAME: Record<string, string> = {
  "INF-CC": "InflataPark",
  "KDS-CC": "KDS",
  "UA-DM": "Urban Arena",
  "CB-DSM": "C&B Dar Al Salam",
  "CB-VM": "C&B Vendome",
  "KDS-DM": "KDS Mini",
};

export const DECISION_PRIORITIES = ["critical", "safety", "security", "commercial", "other"] as const;
export type DecisionPriority = (typeof DECISION_PRIORITIES)[number];

export const DECISION_OUTCOMES = ["pending", "approved", "declined", "deferred"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const ACTION_STATUSES = ["open", "wip", "done"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const REVIEW_STATUSES = ["draft", "presented"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isoWeekLabel(weekStart: string): string {
  return `Week ${isoWeekNumber(weekStart)}`;
}

/** ISO-8601 week number for a YYYY-MM-DD date. */
export function isoWeekNumber(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export function nextWeekBounds(prevStart?: string | null): {
  week_start: string;
  week_end: string;
  meeting_date: string;
  week_label: string;
} {
  const week_start = prevStart ? addDays(prevStart, 7) : mondayOf();
  return {
    week_start,
    week_end: addDays(week_start, 6),
    meeting_date: addDays(week_start, 1),
    week_label: isoWeekLabel(week_start),
  };
}

export function formatReviewDates(start: string, end: string): string {
  const fmt = (s: string) =>
    new Date(`${s}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(start)} to ${fmt(end)}`;
}
