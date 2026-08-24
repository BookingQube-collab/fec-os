import "server-only";

import { z } from "zod";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import { matchLocationAreaName } from "@/lib/location-areas";
import {
  isMaintenanceOtherOption,
  MAINTENANCE_REQUEST_CATEGORIES,
  MAINTENANCE_REQUEST_ISSUE_TYPES,
  type MaintenanceRequestCategory,
  type MaintenanceRequestIssueType,
} from "@/lib/maintenance/request-options";
import { MAINTENANCE_PRIORITIES, type MaintenancePriority } from "@/lib/maintenance/sla";
import { E3_WEEKLY_LOCATIONS } from "@/lib/weekly-reports/constants";

const QATAR_TZ = "Asia/Qatar";
/** Qatar observes UTC+3 year-round (no DST). */
const QATAR_OFFSET = "+03:00";

const PrioritySchema = z.enum(["normal", "medium", "urgent"]);

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export type MaintenanceTechnicianOption = { id: string; name: string };

export type MaintenanceLocationOption = {
  id: string;
  code: string;
  name: string;
  region?: string | null;
};

export type MaintenanceRequestDraftFields = {
  category: string;
  issue_type: string;
  priority: MaintenancePriority;
  area: string;
  /** Polished professional English description (same as polished_description). */
  description: string;
  /** Polished English for the Description textarea. */
  polished_description: string;
  /** `datetime-local` value in Asia/Qatar (`YYYY-MM-DDTHH:mm`), or null if none found. */
  reported_at: string | null;
  /** Raw name hint extracted from notes / AI (for UI matching). */
  assignee_name: string | null;
  /** Resolved technician id when uniquely matched. */
  assigned_technician_id: string | null;
  /** True when more than one technician matched the hint. */
  assignee_ambiguous: boolean;
  /**
   * Display name when a person was requested but no selectable profile id matched.
   * UI shows this in "Requested technician" and persists via remarks on create.
   */
  requested_technician_name: string | null;
  /** Venue inferred from notes (preferred over branch switcher when present). */
  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
};

export interface MaintenanceRequestAiDraftContext {
  notes: string;
  location_id?: string;
  location_code: string;
  location_name: string;
  /** All accessible venues — used to detect branch from free text. */
  available_locations?: MaintenanceLocationOption[];
  /** Active area names for this venue — AI should prefer these. */
  available_areas?: string[];
  available_categories?: string[];
  available_issue_types?: string[];
  /** Assignable technicians for this venue. */
  available_technicians?: MaintenanceTechnicianOption[];
  /** Reference "now" for relative phrases (tests). Defaults to current time. */
  now?: Date;
}

function withoutOther(names: string[]): string[] {
  return names.filter((n) => !isMaintenanceOtherOption(n));
}

function pickAllowed(value: string, allowed: string[], fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const hit = allowed.find((a) => a.toLowerCase() === trimmed.toLowerCase());
  return hit ?? fallback;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeLocKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build searchable aliases for a venue (name, code, E3 / attendance-style labels). */
export function buildLocationAliases(loc: MaintenanceLocationOption): string[] {
  const aliases = new Set<string>();
  aliases.add(loc.code);
  aliases.add(loc.name);
  if (loc.region?.trim()) {
    aliases.add(`${loc.name} ${loc.region}`);
    aliases.add(`${loc.name} - ${loc.region}`);
  }
  const e3 = E3_WEEKLY_LOCATIONS.find((e) => e.code === loc.code);
  if (e3) {
    aliases.add(e3.name);
    aliases.add(`${e3.name} ${e3.venue}`);
    aliases.add(`${e3.name} - ${e3.venue}`);
  }
  const short = loc.code.split("-")[0]?.trim();
  if (short && short.length >= 2) aliases.add(short);

  // Attendance-ingest style friendly labels
  if (loc.code === "UA-DM") {
    aliases.add("Urban Arena");
    aliases.add("Urban Arena - Doha Mall");
    aliases.add("Urban Arena Doha Mall");
  } else if (loc.code === "INF-CC") {
    aliases.add("Inflatapark");
    aliases.add("InflataPark");
    aliases.add("Inflatapark - City Center");
    aliases.add("Inflatapark City Center");
  } else if (loc.code === "KDS-CC") {
    aliases.add("Kids Driving School - City Center");
  } else if (loc.code === "KDS-DM") {
    aliases.add("Kids Driving School Mini - Doha Mall");
    aliases.add("Kids Mini Driving School - Doha Mall");
  } else if (loc.code === "CAR-AP") {
    aliases.add("Carousel - Aspire Park");
  } else if (loc.code === "WM-VM") {
    aliases.add("Winter Mirage - Vendome Mall");
    aliases.add("Winter Mirage Vendome Mall");
  }

  return [...aliases].filter((a) => a.trim().length > 0);
}

/**
 * Detect venue from free-text notes against accessible locations.
 * Prefers longer alias hits (e.g. "Urban Arena" over "UA"). Returns null if ambiguous.
 */
export function matchLocationFromNotes(
  notes: string,
  locations: MaintenanceLocationOption[],
): MaintenanceLocationOption | null {
  const normalizedNotes = normalizeLocKey(notes);
  if (!normalizedNotes || !locations.length) return null;

  type Hit = { loc: MaintenanceLocationOption; score: number };
  const hits: Hit[] = [];

  for (const loc of locations) {
    let bestForLoc = 0;
    for (const alias of buildLocationAliases(loc)) {
      const key = normalizeLocKey(alias);
      if (key.length < 2) continue;

      let matched = false;
      if (key.includes(" ")) {
        matched = normalizedNotes.includes(key);
      } else {
        // Single token / short code: require word boundary (avoids "ua" in "manual")
        matched = new RegExp(`(?:^|\\s)${escapeRegExp(key)}(?:\\s|$)`).test(normalizedNotes);
      }
      if (matched && key.length > bestForLoc) bestForLoc = key.length;
    }
    if (bestForLoc > 0) hits.push({ loc, score: bestForLoc });
  }

  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  const top = hits[0].score;
  const winners = hits.filter((h) => h.score === top);
  const uniqueIds = new Set(winners.map((w) => w.loc.id));
  if (uniqueIds.size !== 1) return null;
  return winners[0].loc;
}

/** Resolve a location_code / name hint against available locations. */
export function matchLocationByCodeOrName(
  hint: string | null | undefined,
  locations: MaintenanceLocationOption[],
): MaintenanceLocationOption | null {
  const raw = hint?.trim();
  if (!raw || !locations.length) return null;
  const key = normalizeLocKey(raw);
  const byCode = locations.find((l) => normalizeLocKey(l.code) === key || l.code.toUpperCase() === raw.toUpperCase());
  if (byCode) return byCode;
  const byName = locations.filter((l) => {
    const n = normalizeLocKey(l.name);
    return n === key || key.includes(n) || n.includes(key);
  });
  if (byName.length === 1) return byName[0];
  return matchLocationFromNotes(raw, locations);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

/** Format a Date as `datetime-local` wall clock in Asia/Qatar. */
export function formatQatarDatetimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Build a Date from Qatar local civil components. */
function qatarLocalDate(y: number, monthIndex: number, d: number, h: number, min: number): Date {
  return new Date(
    `${y}-${pad2(monthIndex + 1)}-${pad2(d)}T${pad2(h)}:${pad2(min)}:00${QATAR_OFFSET}`,
  );
}

function qatarParts(now: Date): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  let h = get("hour");
  if (h === 24) h = 0;
  return { y: get("year"), m: get("month") - 1, d: get("day"), h, min: get("minute") };
}

function addQatarDays(base: Date, days: number): { y: number; m: number; d: number } {
  const p = qatarParts(base);
  const shifted = qatarLocalDate(p.y, p.m, p.d, 12, 0);
  shifted.setTime(shifted.getTime() + days * 24 * 60 * 60 * 1000);
  const n = qatarParts(shifted);
  return { y: n.y, m: n.m, d: n.d };
}

function parseHourMinute(
  hourRaw: string,
  minuteRaw: string | undefined,
  ampm: string | undefined,
): { h: number; min: number } | null {
  let h = Number(hourRaw);
  const min = minuteRaw ? Number(minuteRaw) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  if (ampm) {
    // Normalize "pm.", "p.m.", "PM" → "pm"
    const ap = ampm.toLowerCase().replace(/[^a-z]/g, "");
    if (ap === "am") {
      if (h === 12) h = 0;
    } else if (ap === "pm") {
      if (h < 12) h += 12;
    }
  }
  return { h, min };
}

const TIME_FRAGMENT =
  /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i;

/**
 * Heuristic parser for dates/times in free-text notes (Qatar / Asia/Qatar).
 * Prefers explicit calendar dates over relative phrases.
 */
export function parseReportedAtFromNotes(notes: string, now: Date = new Date()): string | null {
  const text = notes.trim();
  if (!text) return null;

  // Explicit: "4 aug 2026 1 am", "4 August 2026 at 1:00am"
  const monthNames = Object.keys(MONTH_INDEX).join("|");
  const explicitMonth = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(\\d{4})(?:\\s+(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?)?`,
    "i",
  );
  const em = text.match(explicitMonth);
  if (em) {
    const day = Number(em[1]);
    const month = MONTH_INDEX[em[2].toLowerCase()];
    const year = Number(em[3]);
    const time = em[4]
      ? parseHourMinute(em[4], em[5], em[6])
      : { h: 9, min: 0 };
    if (
      time &&
      Number.isFinite(day) &&
      month !== undefined &&
      day >= 1 &&
      day <= 31 &&
      year >= 2000 &&
      year <= 2100
    ) {
      return formatQatarDatetimeLocal(qatarLocalDate(year, month, day, time.h, time.min));
    }
  }

  // Explicit numeric: 04/08/2026, 4-8-2026, 2026-08-04 (with optional time)
  const numericDate = text.match(
    /\b(?:(\d{4})[/-](\d{1,2})[/-](\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{4}))(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?\b/i,
  );
  if (numericDate) {
    let year: number;
    let month: number;
    let day: number;
    if (numericDate[1]) {
      year = Number(numericDate[1]);
      month = Number(numericDate[2]);
      day = Number(numericDate[3]);
    } else {
      // Prefer D/M/Y (common in Qatar / UK) when day > 12 or ambiguous
      const a = Number(numericDate[4]);
      const b = Number(numericDate[5]);
      year = Number(numericDate[6]);
      if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        day = a;
        month = b;
      }
    }
    const time = numericDate[7]
      ? parseHourMinute(numericDate[7], numericDate[8], numericDate[9])
      : { h: 9, min: 0 };
    if (
      time &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31 &&
      year >= 2000 &&
      year <= 2100
    ) {
      return formatQatarDatetimeLocal(qatarLocalDate(year, month - 1, day, time.h, time.min));
    }
  }

  const lower = text.toLowerCase();
  const today = qatarParts(now);

  // tomorrow [time]
  const tomorrowMatch = lower.match(
    /\btomorrow(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?\b/i,
  );
  if (tomorrowMatch) {
    const next = addQatarDays(now, 1);
    const time = tomorrowMatch[1]
      ? parseHourMinute(tomorrowMatch[1], tomorrowMatch[2], tomorrowMatch[3])
      : { h: 9, min: 0 };
    if (time) {
      return formatQatarDatetimeLocal(qatarLocalDate(next.y, next.m, next.d, time.h, time.min));
    }
  }

  // today [time]
  const todayMatch = lower.match(
    /\btoday(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?\b/i,
  );
  if (todayMatch?.[1]) {
    const time = parseHourMinute(todayMatch[1], todayMatch[2], todayMatch[3]);
    if (time) {
      return formatQatarDatetimeLocal(qatarLocalDate(today.y, today.m, today.d, time.h, time.min));
    }
  }

  // tonight / this evening — default 20:00 Qatar unless a nearby clock time exists
  if (/\btonight\b|\bthis\s+evening\b/.test(lower)) {
    const nearTime = text.match(
      new RegExp(`(?:tonight|this\\s+evening)[^.]{0,40}${TIME_FRAGMENT.source}`, "i"),
    ) ?? text.match(new RegExp(`${TIME_FRAGMENT.source}[^.]{0,40}(?:tonight|this\\s+evening)`, "i"));
    const time = nearTime
      ? parseHourMinute(nearTime[1], nearTime[2], nearTime[3])
      : { h: 20, min: 0 };
    if (time) {
      return formatQatarDatetimeLocal(qatarLocalDate(today.y, today.m, today.d, time.h, time.min));
    }
  }

  // this morning / this afternoon
  if (/\bthis\s+morning\b/.test(lower)) {
    return formatQatarDatetimeLocal(qatarLocalDate(today.y, today.m, today.d, 9, 0));
  }
  if (/\bthis\s+afternoon\b/.test(lower)) {
    return formatQatarDatetimeLocal(qatarLocalDate(today.y, today.m, today.d, 15, 0));
  }

  // Standalone clock time with arrangement language: "at 1 am", "arrange … 2pm"
  const arrangeTime = text.match(
    /(?:arrang\w*|labor|labour|please|schedule|come|send)\b[^.]{0,60}?\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i,
  );
  if (arrangeTime) {
    const time = parseHourMinute(arrangeTime[1], arrangeTime[2], arrangeTime[3]);
    if (time) {
      return formatQatarDatetimeLocal(qatarLocalDate(today.y, today.m, today.d, time.h, time.min));
    }
  }

  return null;
}

/**
 * Normalize an AI / ISO datetime string into Qatar `datetime-local`.
 */
export function normalizeReportedAtValue(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();

  // Already datetime-local-ish
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return formatQatarDatetimeLocal(d);
  }

  const asDate = new Date(trimmed);
  if (!Number.isNaN(asDate.getTime())) {
    return formatQatarDatetimeLocal(asDate);
  }

  // Fall back to heuristic parse of the fragment itself
  return parseReportedAtFromNotes(trimmed, now);
}

export type AssigneeMatchResult = {
  assignee_name: string | null;
  assigned_technician_id: string | null;
  assignee_ambiguous: boolean;
  /** Set when a name was found but no selectable technician id matched. */
  requested_technician_name?: string | null;
};

function withRequestedName(result: AssigneeMatchResult): AssigneeMatchResult {
  if (result.assigned_technician_id || result.assignee_ambiguous) {
    return { ...result, requested_technician_name: null };
  }
  const name = cleanAssigneeNameHint(result.assignee_name);
  return {
    ...result,
    assignee_name: name ?? result.assignee_name,
    requested_technician_name: name,
  };
}

const ASSIGNEE_STOP_WORDS = new Set([
  "to",
  "for",
  "please",
  "fix",
  "repair",
  "come",
  "today",
  "tomorrow",
  "tonight",
  "urgent",
  "the",
  "a",
  "an",
  "and",
  "or",
  "if",
  "me",
  "us",
  "him",
  "her",
  "them",
  "those",
  "this",
  "that",
  "very",
  "asap",
  "someone",
  "anyone",
  "team",
  "maintenance",
  "labor",
  "labour",
  "now",
  "later",
  "soon",
]);

/** Strip trailing/embedded stop-words from an assignee capture (e.g. "russel to" → "russel"). */
export function cleanAssigneeNameHint(hint: string | null | undefined): string | null {
  const raw = hint?.trim();
  if (!raw) return null;
  const parts = raw
    .split(/\s+/)
    .map((p) => p.replace(/^[^A-Za-z]+|[^A-Za-z'.-]+$/g, ""))
    .filter((p) => p.length > 0 && !ASSIGNEE_STOP_WORDS.has(p.toLowerCase()));
  if (!parts.length) return null;
  return parts.slice(0, 2).join(" ");
}

/** Case-insensitive unique match of a name hint against technician options. */
export function matchTechnicianByName(
  hint: string | null | undefined,
  technicians: MaintenanceTechnicianOption[],
): AssigneeMatchResult {
  const cleaned = cleanAssigneeNameHint(hint);
  const needle = cleaned?.toLowerCase() ?? "";
  const displayHint = cleaned || hint?.trim() || null;
  if (!needle) {
    return { assignee_name: displayHint, assigned_technician_id: null, assignee_ambiguous: false, requested_technician_name: null };
  }
  if (!technicians.length) {
    return withRequestedName({
      assignee_name: displayHint,
      assigned_technician_id: null,
      assignee_ambiguous: false,
    });
  }

  const exact = technicians.filter((t) => t.name.trim().toLowerCase() === needle);
  if (exact.length === 1) {
    return {
      assignee_name: exact[0].name,
      assigned_technician_id: exact[0].id || null,
      assignee_ambiguous: false,
      requested_technician_name: exact[0].id ? null : exact[0].name,
    };
  }
  if (exact.length > 1) {
    return { assignee_name: exact[0].name, assigned_technician_id: null, assignee_ambiguous: true, requested_technician_name: null };
  }

  // First-name / token exact (e.g. "russell" → "Russell Santos")
  const firstNameHits = technicians.filter((t) => {
    const tokens = t.name.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.some((tok) => tok === needle || (needle.length >= 4 && tok.startsWith(needle)));
  });
  if (firstNameHits.length === 1) {
    return {
      assignee_name: firstNameHits[0].name,
      assigned_technician_id: firstNameHits[0].id || null,
      assignee_ambiguous: false,
      requested_technician_name: firstNameHits[0].id ? null : firstNameHits[0].name,
    };
  }
  if (firstNameHits.length > 1) {
    return {
      assignee_name: displayHint,
      assigned_technician_id: null,
      assignee_ambiguous: true,
      requested_technician_name: null,
    };
  }

  const partial = technicians.filter((t) => {
    const n = t.name.trim().toLowerCase();
    return n.includes(needle) || needle.includes(n);
  });
  if (partial.length === 1) {
    return {
      assignee_name: partial[0].name,
      assigned_technician_id: partial[0].id || null,
      assignee_ambiguous: false,
      requested_technician_name: partial[0].id ? null : partial[0].name,
    };
  }
  if (partial.length > 1) {
    return {
      assignee_name: displayHint,
      assigned_technician_id: null,
      assignee_ambiguous: true,
      requested_technician_name: null,
    };
  }

  // Fuzzy: full-string and first-token (e.g. "russel" → "Russell …")
  const needleFirst = needle.split(/\s+/)[0] ?? needle;
  if (needleFirst.length >= 4) {
    const fuzzy = technicians.filter((t) => {
      const tokens = t.name.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const full = t.name.trim().toLowerCase();
      if (Math.abs(full.length - needle.length) <= 2 && levenshtein(full, needle) <= 1) {
        return true;
      }
      return tokens.some((tok) => {
        if (tok.length < 4) return false;
        if (Math.abs(tok.length - needleFirst.length) > 2) return false;
        // Allow 1 edit for short names, 2 for longer (russell/russel)
        const maxDist = needleFirst.length >= 6 ? 2 : 1;
        return levenshtein(tok, needleFirst) <= maxDist;
      });
    });
    if (fuzzy.length === 1) {
      return {
        assignee_name: fuzzy[0].name,
        assigned_technician_id: fuzzy[0].id || null,
        assignee_ambiguous: false,
        requested_technician_name: fuzzy[0].id ? null : fuzzy[0].name,
      };
    }
    if (fuzzy.length > 1) {
      return {
        assignee_name: displayHint,
        assigned_technician_id: null,
        assignee_ambiguous: true,
        requested_technician_name: null,
      };
    }
  }

  return withRequestedName({
    assignee_name: displayHint,
    assigned_technician_id: null,
    assignee_ambiguous: false,
  });
}

/**
 * Extract a person-name hint from free text without requiring a technician list.
 * Covers: send/assign/ask/tell + Name; "Name to fix/repair"; trailing "to Name".
 */
export function extractAssigneeNameHint(notes: string): string | null {
  if (!notes.trim()) return null;

  const patterns = [
    // send/assign/ask/tell/pass/give [to] Name
    /\b(?:assign(?:ed)?(?:\s+to)?|send(?:\s+to)?|ask(?:\s+to)?|tell|pass(?:\s+to)?|give(?:\s+to)?)\s+([A-Za-z][\w'.-]{1,40}(?:\s+[A-Za-z][\w'.-]{1,40})?)\b/i,
    // Name to fix / repair / check / look
    /\b([A-Za-z][\w'.-]{2,40})\s+to\s+(?:fix|repair|check|look|inspect|handle|resolve|attend)\b/i,
    /\b(?:technician|tech|staff)\s*[:\-]\s*([A-Za-z][\w'.-]{1,40}(?:\s+[A-Za-z][\w'.-]{1,40})?)\b/i,
  ];
  for (const re of patterns) {
    const m = notes.match(re);
    if (m?.[1]) {
      const hint = cleanAssigneeNameHint(m[1]);
      if (hint) return hint;
    }
  }

  const trailing = notes.match(/\bto\s+([A-Za-z][\w'.-]{1,30})\s*[.!]?\s*$/i);
  if (trailing?.[1]) {
    return cleanAssigneeNameHint(trailing[1]);
  }
  return null;
}

/**
 * Extract an assignee name hint from free text ("assign salam", "send to Ali", …)
 * and resolve against available technicians.
 */
export function inferAssigneeFromNotes(
  notes: string,
  technicians: MaintenanceTechnicianOption[],
): AssigneeMatchResult {
  if (!notes.trim()) {
    return {
      assignee_name: null,
      assigned_technician_id: null,
      assignee_ambiguous: false,
      requested_technician_name: null,
    };
  }

  // Prefer scanning known technician names inside the notes (longest first)
  const sorted = [...technicians].sort((a, b) => b.name.length - a.name.length);
  const foundNames: MaintenanceTechnicianOption[] = [];
  const lower = notes.toLowerCase();
  for (const tech of sorted) {
    const name = tech.name.trim();
    if (name.length < 2) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(notes)) foundNames.push(tech);
  }
  if (foundNames.length === 1) {
    return {
      assignee_name: foundNames[0].name,
      assigned_technician_id: foundNames[0].id || null,
      assignee_ambiguous: false,
      requested_technician_name: foundNames[0].id ? null : foundNames[0].name,
    };
  }
  if (foundNames.length > 1) {
    return {
      assignee_name: foundNames[0].name,
      assigned_technician_id: null,
      assignee_ambiguous: true,
      requested_technician_name: null,
    };
  }

  // Fuzzy first-name token scan (e.g. "russel" near "Russell …")
  const fuzzyHits: MaintenanceTechnicianOption[] = [];
  for (const tech of sorted) {
    const first = tech.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (!first || first.length < 4) continue;
    const tokens = lower.match(/\b[a-z][a-z'.-]{3,}\b/g) ?? [];
    for (const tok of tokens) {
      if (ASSIGNEE_STOP_WORDS.has(tok)) continue;
      if (Math.abs(tok.length - first.length) > 2) continue;
      const maxDist = first.length >= 6 ? 2 : 1;
      if (levenshtein(tok, first) <= maxDist) {
        fuzzyHits.push(tech);
        break;
      }
    }
  }
  if (fuzzyHits.length === 1) {
    return {
      assignee_name: fuzzyHits[0].name,
      assigned_technician_id: fuzzyHits[0].id || null,
      assignee_ambiguous: false,
      requested_technician_name: fuzzyHits[0].id ? null : fuzzyHits[0].name,
    };
  }

  const hint = extractAssigneeNameHint(notes);
  if (hint) {
    return matchTechnicianByName(hint, technicians);
  }

  return {
    assignee_name: null,
    assigned_technician_id: null,
    assignee_ambiguous: false,
    requested_technician_name: null,
  };
}

function inferCategory(notes: string): MaintenanceRequestCategory {
  const lower = notes.toLowerCase();
  if (/electric|power|light|socket|breaker|wiring|outlet|fuse|voltage/.test(lower)) return "Electrical";
  if (/plumb|leak|water|drain|toilet|pipe|faucet|sink|sewage/.test(lower)) return "Plumbing";
  if (/hvac|air.?cond|a\/c|\bac\b|cooling|heating|ventilat|thermostat/.test(lower)) return "HVAC";
  if (/structur|ceiling|floor|wall|door|window|crack|tile|roof/.test(lower)) return "Structural";
  if (/equipment|machine|ride|attraction|arcade|kiosk|printer|pos|device/.test(lower)) return "Equipment";
  return "General";
}

function inferIssueType(notes: string): MaintenanceRequestIssueType {
  const lower = notes.toLowerCase();
  if (/leak|drip|flood|wet/.test(lower)) return "Leak";
  if (/noise|loud|rattle|squeak|buzz|hum/.test(lower)) return "Noise";
  if (/safety|hazard|danger|injury|trip|fire|smoke|exposed/.test(lower)) return "Safety";
  if (/clean|dirt|spill|hygiene|mess|peed|urine|vomit/.test(lower)) return "Cleaning";
  if (/break|down|fail|stop|not work|broken|fault|out of (order|service)/.test(lower)) return "Breakdown";
  return "Other";
}

function inferPriority(notes: string): MaintenanceRequestDraftFields["priority"] {
  const lower = notes.toLowerCase();
  if (/urgent|emergency|asap|danger|fire|flood|smoke|safety|guest impact|critical/.test(lower)) {
    return "urgent";
  }
  if (/soon|important|busy|queue|affecting|medium/.test(lower)) return "medium";
  return "normal";
}

const FEC_ZONE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\barcade(?:\s+games?)?\b/i, label: "Arcade" },
  { re: /\bsoft\s*play\b/i, label: "Soft Play" },
  { re: /\bball\s*pit\b/i, label: "Ball Pit" },
  { re: /\btrampoline\b/i, label: "Trampoline" },
  { re: /\bbowling\b/i, label: "Bowling" },
  { re: /\bkaraoke\b/i, label: "Karaoke" },
  { re: /\blaser\s*tag\b/i, label: "Laser Tag" },
  { re: /\bvr\b|virtual\s+reality\b/i, label: "VR" },
  { re: /\breception\b/i, label: "Reception" },
  { re: /\bentrance\b|\blobby\b/i, label: "Entrance" },
  { re: /\bcafe\b|\bcafé\b/i, label: "Cafe" },
  { re: /\bkitchen\b/i, label: "Kitchen" },
  { re: /\bbathroom\b|\brestroom\b|\btoilet\b/i, label: "Restroom" },
  { re: /\bparking\b/i, label: "Parking" },
  { re: /\bparty\s*room\b|\bbirthday\b/i, label: "Party Room" },
  { re: /\bwarehouse\b|\bstor(?:e|age)\b/i, label: "Storage" },
];

function titleCaseArea(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Infer a short zone/area label from free-text notes (for Other when no configured match). */
export function inferAreaHintFromNotes(notes: string): string {
  for (const zone of FEC_ZONE_PATTERNS) {
    if (zone.re.test(notes)) return zone.label;
  }
  const patterns = [
    /(?:in|at|near|around)\s+(?:the\s+)?([A-Za-z0-9][\w\s/-]{1,40}?)(?:\.|,|;|$)/i,
    /area[:\s]+([A-Za-z0-9][\w\s/-]{1,40}?)(?:\.|,|;|$)/i,
  ];
  for (const re of patterns) {
    const m = notes.match(re);
    if (m?.[1]) {
      const area = m[1].trim().replace(/\s+/g, " ");
      // Skip venue-like captures
      if (/^(urban\s+arena|inflatapark|venue|branch|location|today|tomorrow)/i.test(area)) continue;
      if (area.length >= 2 && area.length <= 40) return titleCaseArea(area);
    }
  }
  return "";
}

function inferArea(notes: string, availableAreas: string[]): string {
  const asRows = availableAreas.map((name) => ({ name }));
  const matched = matchLocationAreaName(notes, asRows);
  if (matched) return matched;

  const free = inferAreaHintFromNotes(notes);
  if (free) {
    const rematch = matchLocationAreaName(free, asRows);
    if (rematch) return rematch;
    // Return free-text so the form can select Other + custom name
    return free;
  }
  return "";
}

function normalizeCompareText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Rewrite casual reporter notes into 1–2 clear professional sentences.
 * Used as fallback when no AI key, and when the model echoes raw notes.
 */
export function polishDescription(notes: string, venue: string): string {
  const trimmed = notes.trim().replace(/\s+/g, " ");
  if (!trimmed) return `Maintenance issue reported at ${venue}.`;

  const lower = trimmed.toLowerCase();
  const venueShort = venue.split("(")[0]?.trim() || venue;
  const sentences: string[] = [];

  // Equipment / issue clause
  let issueClause = "";
  if (/\barcade\b/.test(lower) && /not work|isn'?t work|broken|out of order|down|fault/.test(lower)) {
    const count = /\bone\b|\ba\b|\ban\b/.test(lower) ? "One arcade game" : "An arcade game";
    issueClause = `${count} at ${venueShort} is not working`;
  } else if (/not work|isn'?t work|broken|out of order|down|fault/.test(lower)) {
    const equip =
      lower.match(
        /\b((?:arcade|pos|printer|kiosk|ride|attraction|machine|game|ac|a\/c|hvac|light|door|toilet|sink)[\w\s/-]{0,20}?)\s+(?:is\s+)?(?:not\s+work|broken|down)/i,
      )?.[1] ?? "Equipment";
    issueClause = `${titleCaseArea(equip.trim())} at ${venueShort} needs attention`;
  }

  if (issueClause) {
    const urgencyBits: string[] = [];
    if (/customer\s+complaint|guest\s+complaint|complaint/.test(lower)) {
      urgencyBits.push("following a customer complaint");
    }
    if (/urgent|emergency|asap|critical/.test(lower)) {
      urgencyBits.push("marked urgent");
    }
    if (urgencyBits.length) {
      sentences.push(`${issueClause} (${urgencyBits.join(", ")}).`);
    } else {
      sentences.push(`${issueClause}.`);
    }
  }

  // Assignee / schedule clause
  const assigneeHint = extractAssigneeNameHint(trimmed);
  const reportedAt = parseReportedAtFromNotes(trimmed);
  let scheduleClause = "";
  if (assigneeHint) {
    const niceName = titleCaseArea(assigneeHint);
    if (reportedAt) {
      const [datePart, timePart] = reportedAt.split("T");
      const [y, m, d] = (datePart ?? "").split("-");
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthLabel = months[Number(m) - 1] ?? m;
      const [hh, mm] = (timePart ?? "09:00").split(":");
      let h = Number(hh);
      const ap = h >= 12 ? "PM" : "AM";
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      const timeLabel = `${h}:${mm} ${ap}`;
      scheduleClause = `Please send ${niceName} to repair it on ${Number(d)} ${monthLabel} ${y} at ${timeLabel}`;
    } else if (/\btoday\b/.test(lower)) {
      scheduleClause = `Please send ${niceName} to repair it today if possible`;
    } else {
      scheduleClause = `Please assign ${niceName} to repair it`;
    }
  } else if (reportedAt) {
    scheduleClause = `Requested attendance at the scheduled time`;
  }

  if (scheduleClause) {
    sentences.push(`${scheduleClause}.`);
  }

  if (sentences.length) {
    return sentences.join(" ");
  }

  // Generic light cleanup
  let cleaned = trimmed.replace(/\s+([,.!?])/g, "$1");
  cleaned = /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  // Break run-ons lightly after common clause boundaries
  cleaned = cleaned
    .replace(/\bi want you to\b/gi, "Please")
    .replace(/\bvery urgent\b/gi, "This is urgent.")
    .replace(/\bif possible\b/gi, "if possible");
  if (
    /at\s+\w+/i.test(cleaned) ||
    cleaned.toLowerCase().includes(venueShort.toLowerCase())
  ) {
    return cleaned;
  }
  return `${cleaned} Reported at ${venueShort}.`;
}

/** Prefer AI polish when it meaningfully differs from raw notes; otherwise heuristic polish. */
export function ensurePolishedDescription(
  candidate: string | null | undefined,
  notes: string,
  venue: string,
): string {
  const polishedFallback = polishDescription(notes, venue);
  const c = candidate?.trim() ?? "";
  if (!c) return polishedFallback;
  const normC = normalizeCompareText(c);
  const normN = normalizeCompareText(notes);
  // Model echoed raw notes (or near-identical) — force heuristic rewrite
  if (normC === normN) return polishedFallback;
  if (normN.length > 60 && normC === normN.slice(0, normC.length) && c.split(/[.!?]/).filter(Boolean).length < 2) {
    return polishedFallback;
  }
  // Light capitalization cleanup on AI text
  const withPeriod = /[.!?]$/.test(c) ? c : `${c}.`;
  return withPeriod.charAt(0).toUpperCase() + withPeriod.slice(1);
}

function venueLabel(ctx: MaintenanceRequestAiDraftContext): string {
  return `${ctx.location_name} (${ctx.location_code})`;
}

function withLocationFields(
  fields: Omit<MaintenanceRequestDraftFields, "location_id" | "location_code" | "location_name" | "polished_description"> & {
    polished_description?: string;
  },
  ctx: MaintenanceRequestAiDraftContext,
): MaintenanceRequestDraftFields {
  const polished = (fields.polished_description ?? fields.description).trim() || fields.description;
  return {
    ...fields,
    description: polished,
    polished_description: polished,
    location_id: ctx.location_id ?? null,
    location_code: ctx.location_code || null,
    location_name: ctx.location_name || null,
  };
}

function resolveAssigneeFields(
  notes: string,
  technicians: MaintenanceTechnicianOption[],
  aiAssigneeName?: string | null,
  aiAssigneeId?: string | null,
): Pick<
  MaintenanceRequestDraftFields,
  "assignee_name" | "assigned_technician_id" | "assignee_ambiguous" | "requested_technician_name"
> {
  if (aiAssigneeId) {
    const byId = technicians.find((t) => t.id === aiAssigneeId);
    if (byId) {
      return {
        assignee_name: byId.name,
        assigned_technician_id: byId.id,
        assignee_ambiguous: false,
        requested_technician_name: null,
      };
    }
  }

  if (aiAssigneeName?.trim()) {
    const matched = matchTechnicianByName(cleanAssigneeNameHint(aiAssigneeName) ?? aiAssigneeName, technicians);
    if (matched.assigned_technician_id || matched.assignee_ambiguous) {
      return {
        assignee_name: matched.assignee_name,
        assigned_technician_id: matched.assigned_technician_id,
        assignee_ambiguous: matched.assignee_ambiguous,
        requested_technician_name: matched.requested_technician_name ?? null,
      };
    }
    if (matched.assignee_name) {
      // Keep hint; still try notes in case they resolve better
      const fromNotes = inferAssigneeFromNotes(notes, technicians);
      if (fromNotes.assigned_technician_id || fromNotes.assignee_ambiguous) {
        return {
          assignee_name: fromNotes.assignee_name,
          assigned_technician_id: fromNotes.assigned_technician_id,
          assignee_ambiguous: fromNotes.assignee_ambiguous,
          requested_technician_name: fromNotes.requested_technician_name ?? null,
        };
      }
      return {
        assignee_name: matched.assignee_name,
        assigned_technician_id: null,
        assignee_ambiguous: false,
        requested_technician_name: matched.requested_technician_name ?? matched.assignee_name,
      };
    }
  }

  const fromNotes = inferAssigneeFromNotes(notes, technicians);
  if (fromNotes.assigned_technician_id || fromNotes.assignee_name) {
    return {
      assignee_name: fromNotes.assignee_name,
      assigned_technician_id: fromNotes.assigned_technician_id,
      assignee_ambiguous: fromNotes.assignee_ambiguous,
      requested_technician_name: fromNotes.requested_technician_name ?? null,
    };
  }

  // Surface AI name hint even when unmatched so the form can toast / fill requested
  const cleanedAi = cleanAssigneeNameHint(aiAssigneeName);
  if (cleanedAi) {
    return {
      assignee_name: cleanedAi,
      assigned_technician_id: null,
      assignee_ambiguous: false,
      requested_technician_name: cleanedAi,
    };
  }

  return {
    assignee_name: null,
    assigned_technician_id: null,
    assignee_ambiguous: false,
    requested_technician_name: null,
  };
}

function buildFallbackDraft(ctx: MaintenanceRequestAiDraftContext): MaintenanceRequestDraftFields {
  const venue = venueLabel(ctx);
  const available = ctx.available_areas ?? [];
  const categories = withoutOther(ctx.available_categories ?? [...MAINTENANCE_REQUEST_CATEGORIES]);
  const issueTypes = ctx.available_issue_types ?? [...MAINTENANCE_REQUEST_ISSUE_TYPES];
  const techs = ctx.available_technicians ?? [];
  const now = ctx.now ?? new Date();
  const assignee = inferAssigneeFromNotes(ctx.notes, techs);
  const description = polishDescription(ctx.notes, venue);
  return withLocationFields(
    {
      category: pickAllowed(inferCategory(ctx.notes), categories, categories[0] ?? "General"),
      issue_type: pickAllowed(inferIssueType(ctx.notes), issueTypes, "Other"),
      priority: inferPriority(ctx.notes),
      area: inferArea(ctx.notes, available),
      description,
      polished_description: description,
      reported_at: parseReportedAtFromNotes(ctx.notes, now),
      assignee_name: assignee.assignee_name,
      assigned_technician_id: assignee.assigned_technician_id,
      assignee_ambiguous: assignee.assignee_ambiguous,
      requested_technician_name: assignee.requested_technician_name ?? null,
    },
    ctx,
  );
}

function buildUserPrompt(ctx: MaintenanceRequestAiDraftContext): string {
  const available = ctx.available_areas ?? [];
  const categories = withoutOther(ctx.available_categories ?? [...MAINTENANCE_REQUEST_CATEGORIES]);
  const issueTypes = withoutOther(ctx.available_issue_types ?? [...MAINTENANCE_REQUEST_ISSUE_TYPES]);
  const techs = ctx.available_technicians ?? [];
  const locations = ctx.available_locations ?? [];
  const areaLine = available.length
    ? `area — MUST be exactly one of: ${available.join(", ")} (empty string if none match; if none match, return a short zone name like "Arcade" for Other)`
    : 'area — short zone/equipment location within the venue (e.g. "Arcade", "Soft Play", "Entrance"); never leave empty when a zone is mentioned';
  const techLine = techs.length
    ? `assignee_name — person to assign if mentioned (e.g. "send Russell"); MUST be exactly one of: ${techs.map((t) => t.name).join(", ")} (empty string if none / unknown; fix obvious typos)`
    : "assignee_name — person name to assign if mentioned, else empty string";
  const locLine = locations.length
    ? `location_code — venue from the notes if mentioned; MUST be exactly one of: ${locations.map((l) => `${l.code} (${l.name})`).join(", ")} (use empty string if none mentioned — default venue is already ${ctx.location_code})`
    : "location_code — venue code if mentioned, else empty string";
  return [
    "Classify and draft a professional FEC (family entertainment centre) maintenance request.",
    `Default venue: ${ctx.location_name} (${ctx.location_code})`,
    `Reporter notes: ${ctx.notes.trim()}`,
    `Current datetime (Asia/Qatar): ${formatQatarDatetimeLocal(ctx.now ?? new Date())}`,
    "",
    "Return ONLY valid JSON with these fields:",
    locLine,
    `category — one of: ${categories.join(", ")}`,
    `issue_type — one of: ${issueTypes.join(", ")} (use the closest match; do not invent names)`,
    `priority — one of: ${MAINTENANCE_PRIORITIES.join(", ")} (urgent = safety/guest impact/flood/fire/power loss/customer complaint marked urgent; medium = operations affected soon; normal = routine)`,
    areaLine,
    "description — 2-4 polished factual sentences in clear professional English suitable for technicians (do not invent names or details not in the notes; correct grammar/spelling)",
    "polished_description — same polished English as description (required)",
    "reported_at — scheduled/requested date-time from the notes as YYYY-MM-DDTHH:mm in Asia/Qatar (empty string if none mentioned). Prefer explicit dates like \"3 aug 2026 at 5 pm\". Relative words: tonight≈20:00 today, tomorrow defaults to 09:00 unless a time is given.",
    techLine,
    "If the notes name a different venue than the default, set location_code to that venue.",
    "Use Qatar FEC venue operations context (timezone Asia/Qatar).",
  ].join("\n");
}

export async function callMaintenanceRequestAiDraft(
  ctx: MaintenanceRequestAiDraftContext,
): Promise<{ fields: MaintenanceRequestDraftFields; ai_generated: boolean }> {
  const available = ctx.available_areas ?? [];
  const categories = withoutOther(ctx.available_categories ?? [...MAINTENANCE_REQUEST_CATEGORIES]);
  const issueTypes = withoutOther(ctx.available_issue_types ?? [...MAINTENANCE_REQUEST_ISSUE_TYPES]);
  const techs = ctx.available_technicians ?? [];
  const locations = ctx.available_locations ?? [];
  const now = ctx.now ?? new Date();
  const fallback = buildFallbackDraft(ctx);
  const DraftSchema = z.object({
    location_code: z.string().optional().nullable(),
    category: z.string(),
    issue_type: z.string(),
    priority: PrioritySchema,
    area: z.string(),
    description: z.string(),
    polished_description: z.string().optional().nullable(),
    reported_at: z.string().optional().nullable(),
    scheduled_at: z.string().optional().nullable(),
    assignee_name: z.string().optional().nullable(),
    assigned_technician_id: z.string().optional().nullable(),
  });

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a maintenance triage assistant for FEC venues in Qatar. Output only valid JSON matching the requested schema. Always extract venue/location, date/time, and assignee when present in the notes. Polish the description into clear professional English.",
    },
    { role: "user" as const, content: buildUserPrompt(ctx) },
  ];

  const parsed = await completeJsonViaGateway(messages, {
    temperature: 0.3,
    moduleSource: "maintenance.request_draft",
  });
  if (!parsed) return { fields: fallback, ai_generated: false };

  try {
      const fields = DraftSchema.parse(parsed);
      const reportedAt =
        normalizeReportedAtValue(fields.reported_at ?? fields.scheduled_at, now) ??
        parseReportedAtFromNotes(ctx.notes, now);
      const assignee = resolveAssigneeFields(
        ctx.notes,
        techs,
        fields.assignee_name,
        fields.assigned_technician_id,
      );
      // Prefer AI location_code when it uniquely matches; else keep context (already heuristic-resolved)
      const aiLoc = matchLocationByCodeOrName(fields.location_code, locations);
      const resolvedCtx: MaintenanceRequestAiDraftContext = aiLoc
        ? {
            ...ctx,
            location_id: aiLoc.id,
            location_code: aiLoc.code,
            location_name: aiLoc.name,
          }
        : ctx;

      const polished = ensurePolishedDescription(
        fields.polished_description?.trim() || fields.description.trim(),
        ctx.notes,
        venueLabel(resolvedCtx),
      );

      const aiAreaRaw = fields.area.trim() || fallback.area || inferAreaHintFromNotes(ctx.notes);
      const matchedArea = matchLocationAreaName(
        aiAreaRaw,
        available.map((name) => ({ name })),
      );
      // Keep free-text area (e.g. "Arcade") when no configured areas / no match — UI selects Other
      const area = matchedArea || aiAreaRaw;

      return {
        fields: withLocationFields(
          {
            category: pickAllowed(fields.category, categories, fallback.category),
            issue_type: pickAllowed(fields.issue_type, issueTypes, fallback.issue_type),
            priority: fields.priority,
            area,
            description: polished,
            polished_description: polished,
            reported_at: reportedAt,
            assignee_name: assignee.assignee_name,
            assigned_technician_id: assignee.assigned_technician_id,
            assignee_ambiguous: assignee.assignee_ambiguous,
            requested_technician_name: assignee.requested_technician_name ?? null,
          },
          resolvedCtx,
        ),
        ai_generated: true,
      };
    } catch {
      return { fields: fallback, ai_generated: false };
    }
}
