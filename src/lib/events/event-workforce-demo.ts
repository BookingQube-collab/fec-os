/**
 * Pure helpers for HOO event workforce demo seed / delete.
 * Event-scoped only — never touches monthly roster assignments.
 */

import { mayFillRosterDevicePunches } from "@/lib/attendance-hr/roster-punch-fill";
import type { EventRoleDraft } from "@/lib/events/event-roles";
import {
  enumerateDatesInclusive,
  LABOUR_DAY_BASELINE_HOURS,
} from "@/lib/events/event-schedule";

/** Marker written on assignment / slot notes and attendance hr_remarks / raw_payload. */
export const EVENT_WORKFORCE_DEMO_MARKER = "[event_workforce_demo]";

/** Confirmation phrase for destructive delete (must match UI). */
export const EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION = "DELETE EVENT DATA";

/** Max inclusive days a single seed run may cover (volume guard). */
export const EVENT_WORKFORCE_DEMO_MAX_DAYS = 14;

/** Staffing mix for the shared demo pool (unique people, assigned per event). */
export const EVENT_WORKFORCE_DEMO_COUNTS = {
  crew: 65,
  cashier: 4,
  labour: 40,
} as const;

/**
 * Qatar market day rates (QAR) for demo event pay.
 * Labour uses role kind=labour; crew/cashier are shift-kind but still carry day rates
 * so Event Payroll generate can produce QAR without monthly compensation rows.
 */
export const QATAR_EVENT_DEMO_DAY_RATES_QAR = {
  /** General event labour (10h day). */
  labour: 150,
  cleaner: 130,
  maintenance: 180,
  cashier: 200,
  crew: 180,
} as const;

export const EVENT_WORKFORCE_DEMO_DEPARTMENT = "Event demo";

export type DemoStaffBucket = "crew" | "cashier" | "labour";

export type DemoStaffSpec = {
  code: string;
  fullName: string;
  bucket: DemoStaffBucket;
  jobTitle: string;
  staffRole: "crew" | "cashier" | "other";
  roleCode: "crew" | "cashier" | "labour";
  dayRateQar: number | null;
};

/** Roles ensured on each seeded event (cashier added; labour rates set). */
export const EVENT_WORKFORCE_DEMO_ROLE_CATALOG: readonly EventRoleDraft[] = [
  {
    code: "crew",
    name: "Crew",
    kind: "shift",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: QATAR_EVENT_DEMO_DAY_RATES_QAR.crew,
    sort_order: 0,
  },
  {
    code: "cashier",
    name: "Cashier",
    kind: "shift",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: QATAR_EVENT_DEMO_DAY_RATES_QAR.cashier,
    sort_order: 1,
  },
  {
    code: "cleaner",
    name: "Cleaner",
    kind: "labour",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: QATAR_EVENT_DEMO_DAY_RATES_QAR.cleaner,
    sort_order: 2,
  },
  {
    code: "maintenance",
    name: "Maintenance Team",
    kind: "labour",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: QATAR_EVENT_DEMO_DAY_RATES_QAR.maintenance,
    sort_order: 3,
  },
  {
    code: "management",
    name: "Management Team",
    kind: "shift",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: null,
    sort_order: 4,
  },
  {
    code: "labour",
    name: "Labour",
    kind: "labour",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: QATAR_EVENT_DEMO_DAY_RATES_QAR.labour,
    sort_order: 5,
  },
] as const;

/** Stable demo codes: EVT-CRW01 … EVT-CSH01 … EVT-LBR01 (filterable before name). */
export function demoEmployeeCode(bucket: DemoStaffBucket, index1Based: number): string {
  const n = String(index1Based).padStart(2, "0");
  if (bucket === "crew") return `EVT-CRW${n}`;
  if (bucket === "cashier") return `EVT-CSH${n}`;
  return `EVT-LBR${n}`;
}

/** `EVT-CRW01 · Abdallah Osman` — code first for HOO filtering. */
export function formatStaffCodeBeforeName(
  code: string | null | undefined,
  name: string | null | undefined,
): string {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (c && n) return `${c} · ${n}`;
  if (c) return c;
  if (n) return n;
  return "—";
}

export function mayManageEventWorkforceDemo(input: {
  roles: readonly string[];
  jobTitle?: string | null;
}): boolean {
  return mayFillRosterDevicePunches(input);
}

const FIRST_NAMES = [
  "Abdallah",
  "Omar",
  "Hassan",
  "Youssef",
  "Khalid",
  "Ahmed",
  "Mohammed",
  "Ali",
  "Ibrahim",
  "Nasser",
  "Faisal",
  "Tariq",
  "Samir",
  "Rami",
  "Bilal",
  "Karim",
  "Majid",
  "Zaid",
  "Hamza",
  "Adel",
  "Layla",
  "Fatima",
  "Noor",
  "Sara",
  "Maryam",
  "Huda",
  "Aisha",
  "Dana",
  "Rania",
  "Salma",
] as const;

const LAST_NAMES = [
  "Osman",
  "Al-Harbi",
  "Al-Sulaiti",
  "Rahman",
  "Hassan",
  "Khan",
  "Patel",
  "Singh",
  "Fernando",
  "Perera",
  "Nair",
  "Joseph",
  "Thomas",
  "Garcia",
  "Silva",
  "Costa",
  "Mendez",
  "Abbas",
  "Farouk",
  "Qureshi",
  "Malik",
  "Sheikh",
  "Iqbal",
  "Chowdhury",
  "Rahmanov",
  "Kumar",
  "D'Souza",
  "Fernandes",
  "Al-Ansari",
  "Al-Kuwari",
] as const;

function demoFullName(seed: number): string {
  const first = FIRST_NAMES[seed % FIRST_NAMES.length]!;
  const last = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length]!;
  // Disambiguate collisions across large pools.
  const suffix = seed >= FIRST_NAMES.length * LAST_NAMES.length ? ` ${seed + 1}` : "";
  return `${first} ${last}${suffix}`;
}

/** Full shared pool: 65 crew + 4 cashier + 40 labour with unique codes/names. */
export function buildDemoStaffPool(): DemoStaffSpec[] {
  const out: DemoStaffSpec[] = [];
  let nameSeed = 0;
  for (let i = 1; i <= EVENT_WORKFORCE_DEMO_COUNTS.crew; i += 1) {
    out.push({
      code: demoEmployeeCode("crew", i),
      fullName: demoFullName(nameSeed++),
      bucket: "crew",
      jobTitle: "Event Crew",
      staffRole: "crew",
      roleCode: "crew",
      dayRateQar: QATAR_EVENT_DEMO_DAY_RATES_QAR.crew,
    });
  }
  for (let i = 1; i <= EVENT_WORKFORCE_DEMO_COUNTS.cashier; i += 1) {
    out.push({
      code: demoEmployeeCode("cashier", i),
      fullName: demoFullName(nameSeed++),
      bucket: "cashier",
      jobTitle: "Cashier",
      staffRole: "cashier",
      roleCode: "cashier",
      dayRateQar: QATAR_EVENT_DEMO_DAY_RATES_QAR.cashier,
    });
  }
  for (let i = 1; i <= EVENT_WORKFORCE_DEMO_COUNTS.labour; i += 1) {
    out.push({
      code: demoEmployeeCode("labour", i),
      fullName: demoFullName(nameSeed++),
      bucket: "labour",
      jobTitle: "Event Labour",
      staffRole: "other",
      roleCode: "labour",
      dayRateQar: QATAR_EVENT_DEMO_DAY_RATES_QAR.labour,
    });
  }
  return out;
}

export function validateDemoDateRange(dateFrom: string, dateTo: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return "From and To must be valid dates (YYYY-MM-DD).";
  }
  if (dateTo < dateFrom) return "To date must be on or after From date.";
  const days = enumerateDatesInclusive(dateFrom, dateTo);
  if (!days.length) return "Date range is empty.";
  if (days.length > EVENT_WORKFORCE_DEMO_MAX_DAYS) {
    return `Date range cannot exceed ${EVENT_WORKFORCE_DEMO_MAX_DAYS} days (selected ${days.length}).`;
  }
  return null;
}

export function assertDemoDeleteConfirmation(value: string): void {
  if (value.trim() !== EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION) {
    throw new Error(`Type ${EVENT_WORKFORCE_DEMO_DELETE_CONFIRMATION} to confirm.`);
  }
}

export function notesIsDemo(notes: string | null | undefined): boolean {
  return String(notes ?? "").includes(EVENT_WORKFORCE_DEMO_MARKER);
}

/** Shift windows by role (Qatar wall-clock HH:MM). */
export function demoShiftTimesForRole(roleCode: string): { inHm: string; outHm: string } {
  const code = roleCode.toLowerCase();
  if (code === "cashier") return { inHm: "10:00", outHm: "18:00" };
  if (code === "labour" || code === "cleaner" || code === "maintenance") {
    return { inHm: "08:00", outHm: "18:00" };
  }
  return { inHm: "09:00", outHm: "18:00" };
}

/**
 * Punch outcome variety for charts: complete on-time, late, missed out, absent.
 * Deterministic from staff index + day index.
 */
export type DemoPunchPattern = "complete" | "late" | "missed_out" | "absent";

export function demoPunchPattern(staffIndex: number, dayIndex: number): DemoPunchPattern {
  const n = (staffIndex * 7 + dayIndex * 3) % 10;
  if (n === 0) return "absent";
  if (n === 1 || n === 2) return "missed_out";
  if (n === 3 || n === 4) return "late";
  return "complete";
}

/** Build ISO punch times in Asia/Qatar (+03:00) for a work date + scheduled HH:MM. */
export function demoPunchIsos(input: {
  workDate: string;
  scheduledInHm: string;
  scheduledOutHm: string;
  pattern: DemoPunchPattern;
}): { inIso: string | null; outIso: string | null } {
  const { workDate, scheduledInHm, scheduledOutHm, pattern } = input;
  if (pattern === "absent") return { inIso: null, outIso: null };

  const [inH, inM] = scheduledInHm.split(":").map(Number);
  const [outH, outM] = scheduledOutHm.split(":").map(Number);
  const lateMins = pattern === "late" ? 18 : 2;
  const totalIn = (inH ?? 0) * 60 + (inM ?? 0) + lateMins;
  const inHour = Math.floor(totalIn / 60) % 24;
  const inMin = totalIn % 60;
  const inIso = `${workDate}T${String(inHour).padStart(2, "0")}:${String(inMin).padStart(2, "0")}:00+03:00`;

  if (pattern === "missed_out") return { inIso, outIso: null };

  const outIso = `${workDate}T${String(outH ?? 18).padStart(2, "0")}:${String(outM ?? 0).padStart(2, "0")}:00+03:00`;
  return { inIso, outIso };
}
