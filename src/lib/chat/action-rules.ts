/**
 * Pure prefill for creating an existing FEC record from a visible chat message.
 * Strips markup the same way chatEntityPlain does, then clips to the field the
 * existing create action already accepts. Does not choose a site, priority, or assignee.
 */
import { chatEntityPlain } from "@/lib/chat/entity-rules";

export const CHAT_ACTION_KINDS = [
  "MAINTENANCE_TICKET",
  "INCIDENT",
  "PURCHASE_REQUEST",
  "TASK",
  "HANDOVER",
  "REMINDER",
] as const;

export type ChatActionKind = (typeof CHAT_ACTION_KINDS)[number];

/** Matches the incident form. The create action requires a severity and has no default. */
export const CHAT_INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type ChatIncidentSeverity = (typeof CHAT_INCIDENT_SEVERITIES)[number];

/** Title or summary limits on the existing create schemas. */
export const CHAT_ACTION_TITLE_MAX = {
  MAINTENANCE_TICKET: 200,
  INCIDENT: 2000,
  PURCHASE_REQUEST: 200,
  TASK: 200,
  HANDOVER: 200,
  REMINDER: 200,
} as const;

/** Description, detail, or justification limits on the existing create schemas. */
export const CHAT_ACTION_DETAIL_MAX = {
  MAINTENANCE_TICKET: 4000,
  INCIDENT: 4000,
  PURCHASE_REQUEST: 4000,
  TASK: 2000,
  HANDOVER: 1000,
  REMINDER: 2000,
} as const;

/** Matches facility task categories. Chat does not invent a second list of meanings. */
export const CHAT_FACILITY_CATEGORIES = [
  "cleaning",
  "pest_control",
  "hvac",
  "fire_systems",
  "cctv",
  "mall_approvals",
  "maintenance_issues",
  "safety_observations",
  "site_readiness",
] as const;

export type ChatFacilityCategory = (typeof CHAT_FACILITY_CATEGORIES)[number];

/** Matches daily-ops shift periods. */
export const CHAT_HANDOVER_SHIFTS = ["morning", "afternoon", "evening", "full_day"] as const;

export type ChatHandoverShift = (typeof CHAT_HANDOVER_SHIFTS)[number];

export type ChatMaintenancePrefill = {
  kind: "MAINTENANCE_TICKET";
  title: string;
  description: string;
};

export type ChatIncidentPrefill = {
  kind: "INCIDENT";
  summary: string;
  detail: string | null;
};

export type ChatPurchasePrefill = {
  kind: "PURCHASE_REQUEST";
  title: string;
  justification: string;
  lineName: string;
};

export type ChatTaskPrefill = {
  kind: "TASK";
  title: string;
  description: string;
};

export type ChatHandoverPrefill = {
  kind: "HANDOVER";
  note: string;
};

export type ChatReminderPrefill = {
  kind: "REMINDER";
  title: string;
  body: string;
};

export type ChatActionPrefill =
  | ChatMaintenancePrefill
  | ChatIncidentPrefill
  | ChatPurchasePrefill
  | ChatTaskPrefill
  | ChatHandoverPrefill
  | ChatReminderPrefill;

/**
 * Visible plain text clipped to the target fields.
 * Returns null when stripping leaves no text. Short text is returned so the
 * existing create schema can reject it.
 */
export function chatActionPrefill(kind: ChatActionKind, body: string): ChatActionPrefill | null {
  const title = chatEntityPlain(body, CHAT_ACTION_TITLE_MAX[kind]);
  const detail = chatEntityPlain(body, CHAT_ACTION_DETAIL_MAX[kind]);
  if (!title || !detail) return null;

  if (kind === "MAINTENANCE_TICKET") {
    return { kind, title, description: detail };
  }
  if (kind === "INCIDENT") {
    const summaryChars = Array.from(title).length;
    const detailChars = Array.from(detail).length;
    return { kind, summary: title, detail: detailChars > summaryChars ? detail : null };
  }
  if (kind === "TASK") {
    return { kind, title, description: detail };
  }
  if (kind === "HANDOVER") {
    return { kind, note: detail };
  }
  if (kind === "REMINDER") {
    return { kind, title, body: detail };
  }
  return { kind, title, justification: detail, lineName: title };
}
