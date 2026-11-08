/**
 * Per-event crew role master data.
 * kind=shift → Crew schedule date + start/end.
 * kind=labour → day charge + hours-in-day (no traditional shift module).
 */

import { normalizeLabel } from "@/lib/fec-departments";
import {
  EVENT_CREW_SCHEDULE_CATEGORIES,
  type EventCrewScheduleAddShiftMode,
  type EventCrewScheduleCategory,
  resolveEventCrewScheduleCategory,
} from "@/lib/events/crew-schedule-categories";
import { LABOUR_DAY_BASELINE_HOURS } from "@/lib/events/event-schedule";

export const EVENT_ROLE_KINDS = ["shift", "labour"] as const;
export type EventRoleKind = (typeof EVENT_ROLE_KINDS)[number];

export type EventRoleDraft = {
  code: string;
  name: string;
  kind: EventRoleKind;
  default_hours_per_day: number;
  default_day_rate_qar: number | null;
  sort_order: number;
  is_active?: boolean;
};

export type EventRoleRow = EventRoleDraft & {
  id: string;
  event_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

/** Default catalog seeded when an event is created (or ensured for legacy events). */
export const DEFAULT_EVENT_ROLE_CATALOG: readonly EventRoleDraft[] = [
  {
    code: "crew",
    name: "Crew",
    kind: "shift",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: null,
    sort_order: 0,
  },
  {
    code: "cleaner",
    name: "Cleaner",
    kind: "labour",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: null,
    sort_order: 1,
  },
  {
    code: "maintenance",
    name: "Maintenance Team",
    kind: "labour",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: null,
    sort_order: 2,
  },
  {
    code: "management",
    name: "Management Team",
    kind: "shift",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: null,
    sort_order: 3,
  },
  {
    code: "labour",
    name: "Labour",
    kind: "labour",
    default_hours_per_day: LABOUR_DAY_BASELINE_HOURS,
    default_day_rate_qar: null,
    sort_order: 4,
  },
] as const;

export function isEventRoleKind(value: unknown): value is EventRoleKind {
  return typeof value === "string" && (EVENT_ROLE_KINDS as readonly string[]).includes(value);
}

export function slugifyEventRoleCode(name: string): string {
  const raw = normalizeLabel(name)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return raw || "role";
}

export function eventRoleScheduleMode(kind: EventRoleKind | string): EventCrewScheduleAddShiftMode {
  return kind === "labour" ? "labour_days" : "event_day";
}

export function isLabourEventRole(role: { kind?: string | null } | null | undefined): boolean {
  return String(role?.kind ?? "") === "labour";
}

/** Management-style roles may also pick Head Office people on Crew schedule. */
export function eventRoleAllowsPeopleFallback(role: {
  code?: string | null;
  name?: string | null;
  kind?: string | null;
}): boolean {
  if (isLabourEventRole(role)) return false;
  const code = normalizeLabel(role.code);
  if (code === "management") return true;
  const name = normalizeLabel(role.name);
  return (
    /\bmanagement\b/.test(name) ||
    /\bhead office\b/.test(name) ||
    name.includes("إدارة") ||
    name.includes("المكتب الرئيسي")
  );
}

export function resolveLabourHoursPerDay(input: {
  hours_per_day?: number | null;
  role_default_hours_per_day?: number | null;
  fallback?: number;
}): number {
  const override = Number(input.hours_per_day);
  if (Number.isFinite(override) && override >= 1) return override;
  const roleDefault = Number(input.role_default_hours_per_day);
  if (Number.isFinite(roleDefault) && roleDefault >= 1) return roleDefault;
  return Math.max(1, Number(input.fallback) || LABOUR_DAY_BASELINE_HOURS);
}

export function resolveLabourDayRateQar(input: {
  day_rate_qar?: number | null;
  role_default_day_rate_qar?: number | null;
  staff_daily_rate_qar?: number | null;
}): number | null {
  const override = Number(input.day_rate_qar);
  if (Number.isFinite(override) && override >= 0) return override;
  const roleDefault = Number(input.role_default_day_rate_qar);
  if (Number.isFinite(roleDefault) && roleDefault >= 0) return roleDefault;
  const staff = Number(input.staff_daily_rate_qar);
  if (Number.isFinite(staff) && staff >= 0) return staff;
  return null;
}

/**
 * day pay = (hours_worked / hours_in_day) × per_day_charge
 * Same formula as labourDayPayUnits × day rate; kept here for product wording.
 */
export function computeLabourPayFromDayCharge(input: {
  hoursWorked: number;
  hoursInDay: number;
  perDayChargeQar: number;
}): number {
  const hours = Math.max(0, Number(input.hoursWorked) || 0);
  const baseline = Math.max(1, Number(input.hoursInDay) || LABOUR_DAY_BASELINE_HOURS);
  const rate = Math.max(0, Number(input.perDayChargeQar) || 0);
  return Math.round((hours / baseline) * rate * 100) / 100;
}

export type EventRoleMatchInput = {
  event_role_id?: string | null;
  role_label?: string | null;
  job_title?: string | null;
  is_head_office?: boolean;
};

/** Match a person/slot to one event role (id, then name/code, then legacy category for catalog codes). */
export function matchEventRole<T extends { id: string; code: string; name: string; is_active?: boolean }>(
  roles: T[],
  input: EventRoleMatchInput,
): T | null {
  const active = roles.filter((r) => r.is_active !== false);
  if (!active.length) return null;

  if (input.event_role_id) {
    const byId = active.find((r) => r.id === input.event_role_id);
    if (byId) return byId;
  }

  const label = normalizeLabel(input.role_label);
  if (label) {
    const byName = active.find(
      (r) => normalizeLabel(r.name) === label || normalizeLabel(r.code) === label,
    );
    if (byName) return byName;
  }

  const legacy = resolveEventCrewScheduleCategory({
    role_label: input.role_label,
    job_title: input.job_title,
    is_head_office: input.is_head_office,
  });
  const byLegacy = active.find((r) => normalizeLabel(r.code) === legacy);
  if (byLegacy) return byLegacy;

  // Explicit "Labour" role_label → labour catalog role when present.
  if (label === "labour" || label === "labor") {
    return active.find((r) => normalizeLabel(r.code) === "labour") ?? null;
  }

  return null;
}

export function isKnownCrewScheduleCategoryCode(code: string): code is EventCrewScheduleCategory {
  return (EVENT_CREW_SCHEDULE_CATEGORIES as readonly string[]).includes(code);
}

/** Zod / form payloads may use null for optional numeric defaults. */
export type EventRoleDraftInput = {
  code?: string;
  name: string;
  kind?: EventRoleKind;
  default_hours_per_day?: number | null;
  default_day_rate_qar?: number | null;
  sort_order?: number;
  is_active?: boolean;
};

/** Draft roles selected at event create (subset of catalog + optional custom). */
export function normalizeEventRoleDrafts(
  drafts: EventRoleDraftInput[] | null | undefined,
): EventRoleDraft[] {
  if (!drafts?.length) {
    return DEFAULT_EVENT_ROLE_CATALOG.map((r) => ({ ...r }));
  }
  const usedCodes = new Set<string>();
  const out: EventRoleDraft[] = [];
  drafts.forEach((raw, index) => {
    const name = String(raw.name ?? "").trim();
    if (!name) return;
    let code = String(raw.code ?? "").trim() || slugifyEventRoleCode(name);
    code = code.slice(0, 40);
    if (usedCodes.has(code)) code = `${code}_${index + 1}`;
    usedCodes.add(code);
    const kind: EventRoleKind = isEventRoleKind(raw.kind) ? raw.kind : "shift";
    const hours = Number(raw.default_hours_per_day);
    out.push({
      code,
      name: name.slice(0, 120),
      kind,
      default_hours_per_day:
        Number.isFinite(hours) && hours >= 1 ? Math.min(24, hours) : LABOUR_DAY_BASELINE_HOURS,
      default_day_rate_qar:
        raw.default_day_rate_qar == null || raw.default_day_rate_qar === ("" as unknown)
          ? null
          : Math.max(0, Number(raw.default_day_rate_qar) || 0),
      sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : index,
      is_active: raw.is_active !== false,
    });
  });
  return out.length ? out : DEFAULT_EVENT_ROLE_CATALOG.map((r) => ({ ...r }));
}
